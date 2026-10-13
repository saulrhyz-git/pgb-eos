import crypto from "crypto";
import fs from "fs";
import path from "path";
import express, { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { blockPendingPasswordChange, requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../utils/auditLog";
import {
  BackupFileError,
  CodeMigration,
  decodeBackup,
  encodeBackup,
  exportAll,
  isEncrypted,
  listColumns,
  planRestore,
  restoreAll,
  SqlRunner,
  summarize,
} from "../utils/dataBackup";

// ---------------------------------------------------------------------------
// Full-data Backup & Restore — Superadmin only (see utils/dataBackup.ts).
//
//   GET  /api/backup/status           is restore allowed on this instance?
//   POST /api/backup/export           download a backup file of ALL data
//   POST /api/backup/restore/preview  check a backup file against this instance
//   POST /api/backup/restore          replace ALL data here with the file's
//
// Restoring wipes this instance's data, so it's OFF unless the instance's
// server .env has ALLOW_DATA_RESTORE=true. Turn it on only on the instance
// you're restoring INTO (e.g. a dev instance), never on production.
// ---------------------------------------------------------------------------
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);
router.use(requireRole("SUPERADMIN"));

const restoreEnabled = () => process.env.ALLOW_DATA_RESTORE === "true";

// The migrations that ship with the deployed code (server/prisma/migrations —
// the same path from src/routes and dist/routes). Used when restoring into a
// fresh database that has no migration history yet. undefined if the folder
// can't be read, in which case only the backup's own history is used.
function codeMigrations(): CodeMigration[] | undefined {
  try {
    const dir = path.resolve(__dirname, "../../prisma/migrations");
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "migration.sql")))
      .map((d) => ({
        name: d.name,
        checksum: crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, d.name, "migration.sql"))).digest("hex"),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return undefined;
  }
}

function txRunner(tx: Prisma.TransactionClient): SqlRunner {
  return {
    query: (sql, params = []) => tx.$queryRawUnsafe(sql, ...params) as Promise<any[]>,
    exec: async (sql, params = []) => {
      await tx.$executeRawUnsafe(sql, ...params);
    },
  };
}

router.get("/status", async (_req, res) => {
  const tables = await listColumns(txRunner(prisma as unknown as Prisma.TransactionClient));
  res.json({ restoreEnabled: restoreEnabled(), tableCount: tables.size });
});

const exportSchema = z.object({ passphrase: z.string().max(200).optional().default("") });

router.post("/export", async (req, res) => {
  const parsed = exportSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const passphrase = parsed.data.passphrase;
  if (passphrase && passphrase.length < 8) return res.status(400).json({ error: "Use a passphrase of at least 8 characters, or leave it blank." });
  const user = req.user!;

  // One consistent snapshot of every table (REPEATABLE READ), read-only.
  const backup = await prisma.$transaction((tx) => exportAll(txRunner(tx), { id: user.id, name: user.name }), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    timeout: 5 * 60_000,
    maxWait: 10_000,
  });
  const file = encodeBackup(backup, passphrase || undefined);
  const stamp = backup.createdAt.replace(/[:]/g, "").replace(/\..*$/, "").replace("T", "-");
  const filename = `pgb-eos-backup-${stamp}${passphrase ? "-encrypted" : ""}.eosbak`;

  const s = summarize(backup);
  await logAudit({
    user,
    action: "DATA_BACKUP_EXPORT",
    entityType: "Backup",
    summary: `Downloaded a full data backup (${s.tableCount} tables, ${s.totalRows} rows${passphrase ? ", passphrase-protected" : ""})`,
    metadata: { tableCount: s.tableCount, totalRows: s.totalRows, encrypted: Boolean(passphrase), latestMigration: s.source.latestMigration },
  });

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(file.length));
  res.setHeader("Cache-Control", "no-store");
  res.send(file);
});

// The file is sent as the raw request body; the passphrase (if any) as a
// base64 header so any characters survive.
const rawBody = express.raw({ type: "application/octet-stream", limit: "1gb" });

function readUpload(req: express.Request) {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new BackupFileError("No file was uploaded.", "NOT_A_BACKUP");
  const header = req.header("x-backup-passphrase");
  const passphrase = header ? Buffer.from(header, "base64").toString("utf8") : undefined;
  return decodeBackup(req.body, passphrase);
}

router.post("/restore/preview", rawBody, async (req, res) => {
  try {
    const encrypted = Buffer.isBuffer(req.body) && isEncrypted(req.body);
    const backup = readUpload(req);
    const plan = await planRestore(txRunner(prisma as unknown as Prisma.TransactionClient), backup, codeMigrations());
    res.json({ ...summarize(backup), encrypted, plan, restoreEnabled: restoreEnabled() });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.post("/restore", rawBody, async (req, res) => {
  if (!restoreEnabled()) {
    return res.status(403).json({
      error: "Restore is turned off on this instance. To restore into it, set ALLOW_DATA_RESTORE=true in its server .env and restart it. Keep it off on production.",
    });
  }
  if (req.header("x-confirm") !== "RESTORE") return res.status(400).json({ error: 'Type RESTORE to confirm.' });
  const user = req.user!;
  try {
    const backup = readUpload(req);
    // Everything in ONE transaction: any error rolls back and leaves this
    // instance's data exactly as it was.
    const migrations = codeMigrations();
    const restored = await prisma.$transaction((tx) => restoreAll(txRunner(tx), backup, migrations), { timeout: 15 * 60_000, maxWait: 10_000 });
    const s = summarize(backup);
    // Logged into the RESTORED data, so the history shows when it arrived.
    await logAudit({
      user,
      action: "DATA_RESTORE",
      entityType: "Backup",
      summary: `Restored all data from a backup made ${s.createdAt} by ${s.createdBy.name} (${s.tableCount} tables, ${s.totalRows} rows)`,
      metadata: { backupCreatedAt: s.createdAt, backupCreatedBy: s.createdBy, latestMigration: s.source.latestMigration, totalRows: s.totalRows },
    });
    res.json({ restored, ...s });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

export default router;
