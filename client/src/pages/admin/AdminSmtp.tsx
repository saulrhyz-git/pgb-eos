import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Save, Send } from "lucide-react";
import { api } from "../../api/client";

const emptyForm = {
  host: "",
  port: 587,
  secure: false,
  username: "",
  password: "",
  fromAddress: "",
  fromName: "",
};

export default function AdminSmtp() {
  const [form, setForm] = useState(emptyForm);
  const [hasPassword, setHasPassword] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [error, setError] = useState("");

  function refresh() {
    api.getSmtpSettings().then((s) => {
      if (!s) return;
      setForm({
        host: s.host,
        port: s.port,
        secure: s.secure,
        username: s.username || "",
        password: "",
        fromAddress: s.fromAddress,
        fromName: s.fromName || "",
      });
      setHasPassword(s.hasPassword);
      setUpdatedAt(s.updatedAt);
    });
  }
  useEffect(refresh, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      await api.putSmtpSettings({
        host: form.host,
        port: Number(form.port),
        secure: form.secure,
        username: form.username || null,
        password: form.password || undefined,
        fromAddress: form.fromAddress,
        fromName: form.fromName || null,
      });
      setSaved(true);
      refresh();
    } catch (err: any) {
      setError(err.message || "Failed to save SMTP settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!testTo.trim()) return;
    setTesting(true);
    setTestResult("");
    try {
      await api.testSmtpSettings(testTo.trim());
      setTestResult("Test email sent successfully.");
    } catch (err: any) {
      setTestResult(err.message || "Failed to send test email.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold text-slate-800">SMTP Settings</h3>
        <p className="text-sm text-slate-500">Used to send email notifications from the dashboard.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">SMTP Host</label>
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="smtp.example.com"
              value={form.host}
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Port</label>
            <input
              type="number"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.port}
              onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
              required
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="smtp-secure"
              type="checkbox"
              checked={form.secure}
              onChange={(e) => setForm((f) => ({ ...f, secure: e.target.checked }))}
            />
            <label htmlFor="smtp-secure" className="text-sm text-slate-600">
              Use TLS/SSL (secure connection)
            </label>
          </div>
          <div />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">SMTP Username</label>
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">
              SMTP Password {hasPassword && <span className="text-slate-500">(leave blank to keep current)</span>}
            </label>
            <input
              type="password"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">From Address</label>
            <input
              type="email"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="notifications@yourcompany.com"
              value={form.fromAddress}
              onChange={(e) => setForm((f) => ({ ...f, fromAddress: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">From Name (optional)</label>
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="EOS Dashboard"
              value={form.fromName}
              onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))}
            />
          </div>
        </div>

        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        {updatedAt && <div className="text-xs text-slate-500">Last saved {new Date(updatedAt).toLocaleString()}</div>}

        <button
          type="submit"
          disabled={saving}
          className="flex w-fit items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : saved ? "Saved" : "Save Settings"}
        </button>
      </form>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="text-sm font-semibold text-slate-700">Send a test email</div>
        <div className="flex flex-col gap-2 xs:flex-row">
          <input
            type="email"
            placeholder="you@example.com"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm xs:max-w-xs"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
          />
          <button
            onClick={handleTest}
            disabled={testing || !testTo.trim()}
            className="flex items-center justify-center gap-2 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> {testing ? "Sending..." : "Send Test"}
          </button>
        </div>
        {testResult && <div className="text-sm text-slate-600">{testResult}</div>}
      </div>
    </div>
  );
}
