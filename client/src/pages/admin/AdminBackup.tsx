import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, FileSearch, Loader2, Lock, Upload } from "lucide-react";
import { api, downloadBackup, type BackupSummary, type RestorePlan } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

// Full-data Backup & Restore (Superadmin). See server/src/routes/backup.ts.
//
// Backup: one click downloads a single file with every table — users and
// roles, settings, all figures, Rocks, streams, income tax, audit log — and
// the database's migration history. An optional passphrase encrypts it.
//
// Restore: on the instance you're restoring INTO (e.g. a dev instance).
// Replaces ALL data there in one transaction. Only possible where the server
// .env has ALLOW_DATA_RESTORE=true — keep that off on production.

const card = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm sm:p-6";
const input = "rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm";

type Preview = BackupSummary & { encrypted: boolean; plan: RestorePlan; restoreEnabled: boolean };

export default function AdminBackup() {
  const { logout } = useAuth();
  const [status, setStatus] = useState<{ restoreEnabled: boolean; tableCount: number } | null>(null);

  // Backup
  const [passphrase, setPassphrase] = useState("");
  const [passphrase2, setPassphrase2] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState("");
  const [backupError, setBackupError] = useState("");

  // Restore
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [restorePass, setRestorePass] = useState("");
  const [needsPass, setNeedsPass] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [restored, setRestored] = useState<{ totalRows: number; tableCount: number } | null>(null);

  useEffect(() => {
    api.backupStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const passMismatch = passphrase !== "" && passphrase !== passphrase2;
  const passTooShort = passphrase !== "" && passphrase.length < 8;

  async function handleDownload() {
    setDownloading(true);
    setBackupError("");
    setDownloaded("");
    try {
      setDownloaded(await downloadBackup(passphrase));
    } catch (err: any) {
      setBackupError(err.message || "Backup failed");
    } finally {
      setDownloading(false);
    }
  }

  function resetRestore() {
    setPreview(null);
    setConfirmText("");
    setRestoreError("");
    setRestored(null);
  }

  async function handleCheck() {
    if (!file) return;
    setChecking(true);
    resetRestore();
    try {
      const p = await api.previewRestore(file, restorePass);
      setPreview(p);
      setNeedsPass(p.encrypted);
    } catch (err: any) {
      setRestoreError(err.message || "Couldn't read the file");
      if (/passphrase/i.test(err.message || "")) setNeedsPass(true);
    } finally {
      setChecking(false);
    }
  }

  async function handleRestore() {
    if (!file) return;
    setRestoring(true);
    setRestoreError("");
    try {
      const r = await api.restoreBackup(file, restorePass);
      setRestored({ totalRows: r.totalRows, tableCount: r.tableCount });
    } catch (err: any) {
      setRestoreError(err.message || "Restore failed — nothing was changed.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
          <DatabaseBackup className="h-4 w-4 text-brand-600 dark:text-brand-400" /> Backup &amp; Restore
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Download everything in one file, and restore it into another instance (for example a dev instance) to rebuild the app exactly as it was.
        </p>
      </div>

      {/* ---------- Backup ---------- */}
      <div className={card}>
        <div className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Back up all data</div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Every table{status ? ` (${status.tableCount})` : ""}: users and roles, Business Units and Companies, Targets, Actuals, Disbursements, Notes, Streams, Income Tax,
          Rocks, Years and wrap-up reports, settings, the Audit Log, and the database's migration history. Taken as one consistent snapshot.
        </p>

        <div className="mb-4 rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          The file includes users' password hashes, the SMTP password and the AI API key. Store it somewhere safe, or set a passphrase to encrypt it.
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-xl">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Passphrase (optional, recommended)</label>
            <input type="password" autoComplete="new-password" className={input} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Repeat passphrase</label>
            <input type="password" autoComplete="new-password" className={input} value={passphrase2} onChange={(e) => setPassphrase2(e.target.value)} disabled={!passphrase} />
          </div>
        </div>
        {passTooShort && <p className="mt-2 text-xs text-red-600 dark:text-red-400">Use at least 8 characters, or leave it blank.</p>}
        {!passTooShort && passMismatch && passphrase2 && <p className="mt-2 text-xs text-red-600 dark:text-red-400">The passphrases don't match.</p>}
        {passphrase && !passTooShort && !passMismatch && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Keep the passphrase safe — without it the file can't be restored.</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownload}
            disabled={downloading || passMismatch || passTooShort}
            className="flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "Preparing backup..." : "Back up all data"}
          </button>
          {downloaded && (
            <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" /> Downloaded {downloaded}
            </span>
          )}
        </div>
        {backupError && <div className="mt-3 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">{backupError}</div>}
      </div>

      {/* ---------- Restore ---------- */}
      <div className={card}>
        <div className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Restore from a backup</div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Replaces <strong>all</strong> data on this instance with the file's — including users, so you'll sign in with the accounts from the backup afterwards. It runs as one
          step: if anything goes wrong, nothing here changes.
        </p>

        {status && !status.restoreEnabled && (
          <div className="mb-4 flex gap-2 rounded-md bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-200">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Restore is turned off on this instance. You can still check a file below. To restore into this instance, add <code>ALLOW_DATA_RESTORE=true</code> to its server{" "}
              <code>.env</code> and restart it. Keep it off on production.
            </span>
          </div>
        )}

        {restored ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/40 px-3 py-2 text-sm text-green-800 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4" /> Restored {restored.totalRows.toLocaleString()} rows across {restored.tableCount} tables.
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Your current sign-in belongs to the data that was replaced. Sign in again with an account from the backup.</p>
            <button onClick={logout} className="self-start rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
              Sign out and sign in again
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-xl">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Backup file (.eosbak)</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".eosbak,application/octet-stream"
                  className="text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:px-3 file:py-1.5 file:text-sm"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setNeedsPass(false);
                    setRestorePass("");
                    resetRestore();
                  }}
                />
              </div>
              {needsPass && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Passphrase</label>
                  <input type="password" className={input} value={restorePass} onChange={(e) => setRestorePass(e.target.value)} />
                </div>
              )}
            </div>
            <button
              onClick={handleCheck}
              disabled={!file || checking}
              className="mt-3 flex items-center gap-2 rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />} Check file
            </button>

            {restoreError && <div className="mt-3 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">{restoreError}</div>}

            {preview && (
              <div className="mt-4 flex flex-col gap-3">
                <div className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
                  Backup made <strong>{new Date(preview.createdAt).toLocaleString()}</strong> by {preview.createdBy.name}:{" "}
                  {preview.totalRows.toLocaleString()} rows in {preview.tableCount} tables{preview.encrypted ? " (encrypted)" : ""}.
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    App version (latest migration): backup {preview.plan.sourceLatestMigration ?? "unknown"} · this instance {preview.plan.targetLatestMigration ?? "none recorded"}
                  </div>
                </div>

                {preview.plan.errors.length > 0 && (
                  <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                    <div className="mb-1 font-semibold">Can't restore this file here:</div>
                    <ul className="list-disc pl-5">
                      {preview.plan.errors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {preview.plan.warnings.length > 0 && (
                  <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    <ul className="list-disc pl-5">
                      {preview.plan.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {preview.plan.ok && preview.restoreEnabled && (
                  <div className="rounded-md border border-red-200 dark:border-red-900 p-3">
                    <div className="mb-2 flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>This deletes everything currently on this instance and replaces it with the backup. Type RESTORE to continue.</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input className={`${input} w-40`} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTORE" />
                      <button
                        onClick={handleRestore}
                        disabled={restoring || confirmText !== "RESTORE"}
                        className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {restoring ? "Restoring..." : "Restore all data"}
                      </button>
                    </div>
                  </div>
                )}
                {preview.plan.ok && !preview.restoreEnabled && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">This file is compatible with this instance, but restore is turned off here.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
