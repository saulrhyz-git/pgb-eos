import crypto from "crypto";
import zlib from "zlib";

// ---------------------------------------------------------------------------
// Full-data backup & restore (Superadmin → Admin → Backup & Restore).
//
// A backup is every table in the app's database schema — all data, plus
// Prisma's own migration history table (_prisma_migrations), so a database
// restored from it (and anything cloned from that) carries the same
// migration record as the source and future `prisma migrate deploy` runs
// behave exactly as they did on the source.
//
// Exactness: rows are exported by Postgres itself (json_agg) and kept as the
// JSON text Postgres produced — never parsed into JavaScript numbers — and
// restored by Postgres itself (json_populate_recordset). So Decimal amounts,
// timestamps, enums and JSON columns come back byte-for-byte, with no
// floating-point rounding.
//
// File: gzip'd JSON. With a passphrase it's additionally encrypted with
// AES-256-GCM (key from scrypt), so a lost file doesn't expose password
// hashes, the SMTP password or the AI API key, all of which are in it.
//
// Restore replaces EVERYTHING in the target database, in ONE transaction:
// any error (incompatible file, constraint failure, row-count mismatch)
// rolls back and leaves the target exactly as it was.
//
// The SQL runs through the small SqlRunner interface so the same code works
// with Prisma in the app ($queryRawUnsafe / $executeRawUnsafe inside a
// transaction) and with a plain Postgres client in tests.
// ---------------------------------------------------------------------------

export interface SqlRunner {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string, params?: unknown[]): Promise<void>;
}

export const MIGRATIONS_TABLE = "_prisma_migrations";
const FORMAT = "pgb-eos-backup";
const FORMAT_VERSION = 1;

export interface BackupColumn {
  name: string;
  nullable: boolean;
  hasDefault: boolean;
}

export interface BackupTable {
  name: string;
  columns: string[];
  rowCount: number;
  // JSON array of rows, exactly as Postgres's json_agg produced it.
  rows: string;
}

export interface BackupFile {
  format: typeof FORMAT;
  formatVersion: number;
  createdAt: string;
  createdBy: { id: string; name: string };
  source: { latestMigration: string | null; migrationCount: number; postgresVersion: string };
  tables: BackupTable[];
}

export function q(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

// ---------- Introspection ----------

export async function listColumns(sql: SqlRunner): Promise<Map<string, BackupColumn[]>> {
  const rows = await sql.query<{ table_name: string; column_name: string; is_nullable: string; column_default: string | null; is_identity: string; is_generated: string }>(
    `SELECT c.table_name, c.column_name, c.is_nullable, c.column_default, c.is_identity, c.is_generated
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = current_schema() AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position`
  );
  const map = new Map<string, BackupColumn[]>();
  for (const r of rows) {
    if (r.is_generated === "ALWAYS") continue; // generated columns can't be inserted
    const list = map.get(r.table_name) ?? [];
    list.push({ name: r.column_name, nullable: r.is_nullable === "YES", hasDefault: r.column_default !== null || r.is_identity === "YES" });
    map.set(r.table_name, list);
  }
  return map;
}

async function latestMigration(sql: SqlRunner, tables: Map<string, BackupColumn[]>) {
  if (!tables.has(MIGRATIONS_TABLE)) return { latestMigration: null, migrationCount: 0 };
  const rows = await sql.query<{ name: string | null; n: number }>(
    `SELECT max(migration_name) AS name, count(*)::int AS n FROM ${q(MIGRATIONS_TABLE)} WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
  );
  return { latestMigration: rows[0]?.name ?? null, migrationCount: Number(rows[0]?.n ?? 0) };
}

// Parent tables before the tables that reference them, so each INSERT's
// foreign keys already have their targets. Self-references (e.g. a Rock's
// rolledFromId) are fine within one INSERT, since Postgres checks foreign
// keys at the end of the statement.
export async function insertOrder(sql: SqlRunner, tableNames: string[]): Promise<string[]> {
  const edges = await sql.query<{ child: string; parent: string }>(
    `SELECT ch.relname AS child, pa.relname AS parent
       FROM pg_constraint c
       JOIN pg_class ch ON ch.oid = c.conrelid
       JOIN pg_class pa ON pa.oid = c.confrelid
       JOIN pg_namespace n ON n.oid = ch.relnamespace
      WHERE c.contype = 'f' AND n.nspname = current_schema()`
  );
  const set = new Set(tableNames);
  const deps = new Map<string, Set<string>>(tableNames.map((t) => [t, new Set<string>()]));
  for (const e of edges) if (set.has(e.child) && set.has(e.parent) && e.child !== e.parent) deps.get(e.child)!.add(e.parent);

  const order: string[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (t: string, path: string[]) => {
    if (done.has(t)) return;
    if (visiting.has(t)) throw new Error(`Tables reference each other in a loop (${[...path, t].join(" → ")}); this backup can't be restored automatically.`);
    visiting.add(t);
    for (const p of [...deps.get(t)!].sort()) visit(p, [...path, t]);
    visiting.delete(t);
    done.add(t);
    order.push(t);
  };
  for (const t of [...tableNames].sort()) visit(t, []);
  return order;
}

// ---------- Export ----------

/** Run inside a REPEATABLE READ transaction so every table comes from the same moment. */
export async function exportAll(sql: SqlRunner, createdBy: { id: string; name: string }): Promise<BackupFile> {
  const columns = await listColumns(sql);
  const tables: BackupTable[] = [];
  for (const name of [...columns.keys()].sort()) {
    const [{ rows, n }] = await sql.query<{ rows: string; n: number }>(
      `SELECT COALESCE((SELECT json_agg(t)::text FROM ${q(name)} t), '[]') AS rows, (SELECT count(*)::int FROM ${q(name)}) AS n`
    );
    tables.push({ name, columns: columns.get(name)!.map((c) => c.name), rowCount: Number(n), rows });
  }
  const [{ v }] = await sql.query<{ v: string }>(`SELECT current_setting('server_version') AS v`);
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    createdBy,
    source: { ...(await latestMigration(sql, columns)), postgresVersion: v },
    tables,
  };
}

// ---------- File encoding ----------

const ENC_MAGIC = Buffer.from("PGBEOSENC1");
const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function encodeBackup(backup: BackupFile, passphrase?: string): Buffer {
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(backup), "utf8"), { level: 9 });
  if (!passphrase) return gz;
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(gz), cipher.final()]);
  return Buffer.concat([ENC_MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export class BackupFileError extends Error {
  status = 400;
  constructor(message: string, public code: "NOT_A_BACKUP" | "PASSPHRASE_REQUIRED" | "WRONG_PASSPHRASE" | "CORRUPT") {
    super(message);
  }
}

export function isEncrypted(buf: Buffer): boolean {
  return buf.length > ENC_MAGIC.length && buf.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC);
}

export function decodeBackup(buf: Buffer, passphrase?: string): BackupFile {
  let gz: Buffer;
  if (isEncrypted(buf)) {
    if (!passphrase) throw new BackupFileError("This backup is passphrase-protected. Enter the passphrase used when it was downloaded.", "PASSPHRASE_REQUIRED");
    const o = ENC_MAGIC.length;
    const salt = buf.subarray(o, o + 16);
    const iv = buf.subarray(o + 16, o + 28);
    const tag = buf.subarray(o + 28, o + 44);
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
      decipher.setAuthTag(tag);
      gz = Buffer.concat([decipher.update(buf.subarray(o + 44)), decipher.final()]);
    } catch {
      throw new BackupFileError("Wrong passphrase (or the file is damaged).", "WRONG_PASSPHRASE");
    }
  } else if (buf.length > 2 && buf.subarray(0, 2).equals(GZIP_MAGIC)) {
    gz = buf;
  } else {
    throw new BackupFileError("This isn't a backup file from this app.", "NOT_A_BACKUP");
  }
  let parsed: any;
  try {
    parsed = JSON.parse(zlib.gunzipSync(gz).toString("utf8"));
  } catch {
    throw new BackupFileError("The backup file is damaged and can't be read.", "CORRUPT");
  }
  if (parsed?.format !== FORMAT || !Array.isArray(parsed.tables)) throw new BackupFileError("This isn't a backup file from this app.", "NOT_A_BACKUP");
  if (parsed.formatVersion > FORMAT_VERSION) throw new BackupFileError("This backup was made by a newer version of the app. Update this instance first.", "NOT_A_BACKUP");
  return parsed as BackupFile;
}

// ---------- Compatibility ----------

export interface RestorePlan {
  ok: boolean;
  errors: string[];
  warnings: string[];
  tables: { name: string; rowCount: number; status: "restore" | "missing-in-target" | "empty-not-in-backup" }[];
  sourceLatestMigration: string | null;
  targetLatestMigration: string | null;
}

/**
 * Compares a backup with the target database, column by column. Blocking:
 * a backup table (with rows) the target doesn't have, a backup column (with
 * data) the target doesn't have, or a required target column the backup
 * can't fill. Everything else restores; target tables the backup doesn't
 * have are emptied (e.g. a newer feature's table when the backup is older).
 */
export async function planRestore(sql: SqlRunner, backup: BackupFile): Promise<RestorePlan> {
  const target = await listColumns(sql);
  const errors: string[] = [];
  const warnings: string[] = [];
  const tables: RestorePlan["tables"] = [];

  for (const t of backup.tables) {
    const cols = target.get(t.name);
    if (!cols) {
      if (t.name === MIGRATIONS_TABLE) {
        tables.push({ name: t.name, rowCount: t.rowCount, status: "restore" }); // created on restore if missing
      } else if (t.rowCount > 0) {
        errors.push(`Table "${t.name}" (${t.rowCount} rows) doesn't exist on this instance. Deploy the same app version here first.`);
        tables.push({ name: t.name, rowCount: t.rowCount, status: "missing-in-target" });
      } else {
        warnings.push(`Table "${t.name}" doesn't exist here; it's empty in the backup, so nothing is lost.`);
        tables.push({ name: t.name, rowCount: 0, status: "missing-in-target" });
      }
      continue;
    }
    tables.push({ name: t.name, rowCount: t.rowCount, status: "restore" });
    const targetNames = new Set(cols.map((c) => c.name));
    const backupNames = new Set(t.columns);
    const extra = t.columns.filter((c) => !targetNames.has(c));
    if (extra.length && t.rowCount > 0) {
      const withData = extra.filter((c) => jsonColumnHasData(t.rows, c));
      if (withData.length) errors.push(`"${t.name}" has data in column(s) ${withData.join(", ")} that this instance doesn't have. Deploy the same app version here first.`);
      const empty = extra.filter((c) => !withData.includes(c));
      if (empty.length) warnings.push(`"${t.name}": column(s) ${empty.join(", ")} aren't on this instance; they're empty in the backup, so they're skipped.`);
    }
    const missingRequired = cols.filter((c) => !backupNames.has(c.name) && !c.nullable && !c.hasDefault);
    if (missingRequired.length && t.rowCount > 0) {
      errors.push(`"${t.name}" needs column(s) ${missingRequired.map((c) => c.name).join(", ")} that the backup doesn't have. This instance is on a newer app version than the backup.`);
    }
    const missingOptional = cols.filter((c) => !backupNames.has(c.name) && (c.nullable || c.hasDefault));
    if (missingOptional.length && t.rowCount > 0) {
      warnings.push(`"${t.name}": ${missingOptional.map((c) => c.name).join(", ")} aren't in the backup and will use their defaults.`);
    }
  }
  const inBackup = new Set(backup.tables.map((t) => t.name));
  for (const name of target.keys()) {
    if (!inBackup.has(name)) {
      warnings.push(`Table "${name}" isn't in the backup; it will be left empty.`);
      tables.push({ name, rowCount: 0, status: "empty-not-in-backup" });
    }
  }

  const t = await latestMigration(sql, target);
  if (backup.source.latestMigration && t.latestMigration && backup.source.latestMigration !== t.latestMigration) {
    warnings.push(
      `The backup's latest migration (${backup.source.latestMigration}) differs from this instance's (${t.latestMigration}). The restore replaces this instance's migration history with the backup's, so deploy the same app version that made the backup.`
    );
  }
  return { ok: errors.length === 0, errors, warnings, tables, sourceLatestMigration: backup.source.latestMigration, targetLatestMigration: t.latestMigration };
}

// Cheap check without parsing numbers: does any row have a non-null value for this key?
function jsonColumnHasData(rowsJson: string, column: string): boolean {
  const rows = JSON.parse(rowsJson, (_k, v) => (typeof v === "number" ? 0 : v)) as Record<string, unknown>[];
  return rows.some((r) => r[column] !== null && r[column] !== undefined);
}

// ---------- Restore ----------

const PRISMA_MIGRATIONS_DDL = `CREATE TABLE IF NOT EXISTS ${q(MIGRATIONS_TABLE)} (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

/** Must run inside ONE transaction — on any error the caller's transaction rolls everything back. */
export async function restoreAll(sql: SqlRunner, backup: BackupFile): Promise<{ table: string; rows: number }[]> {
  const plan = await planRestore(sql, backup);
  if (!plan.ok) throw Object.assign(new Error(plan.errors.join(" ")), { status: 409 });

  if (backup.tables.some((t) => t.name === MIGRATIONS_TABLE)) await sql.exec(PRISMA_MIGRATIONS_DDL);

  const target = await listColumns(sql);
  const all = [...target.keys()];
  if (all.length) await sql.exec(`TRUNCATE TABLE ${all.map(q).join(", ")} CASCADE`);

  const byName = new Map(backup.tables.map((t) => [t.name, t]));
  const restored: { table: string; rows: number }[] = [];
  for (const name of await insertOrder(sql, all)) {
    const t = byName.get(name);
    if (!t || t.rowCount === 0) {
      restored.push({ table: name, rows: 0 });
      continue;
    }
    const targetNames = new Set(target.get(name)!.map((c) => c.name));
    const cols = t.columns.filter((c) => targetNames.has(c)).map(q).join(", ");
    await sql.exec(`INSERT INTO ${q(name)} (${cols}) SELECT ${cols} FROM json_populate_recordset(NULL::${q(name)}, $1::json)`, [t.rows]);
    const [{ n }] = await sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${q(name)}`);
    if (Number(n) !== t.rowCount) throw new Error(`"${name}": expected ${t.rowCount} rows after restore, found ${n}. Nothing was changed.`);
    restored.push({ table: name, rows: Number(n) });
  }
  return restored;
}

export function summarize(backup: BackupFile) {
  return {
    createdAt: backup.createdAt,
    createdBy: backup.createdBy,
    source: backup.source,
    tableCount: backup.tables.length,
    totalRows: backup.tables.reduce((s, t) => s + t.rowCount, 0),
  };
}
