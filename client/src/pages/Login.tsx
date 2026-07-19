import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Set only for a 423 (account locked) response — the backend locks an
  // account for 60 seconds after 3 consecutive invalid-password attempts.
  // This just counts down the same window client-side so the Sign in button
  // stays disabled without the person needing to guess when to retry.
  const [lockedSeconds, setLockedSeconds] = useState(0);

  useEffect(() => {
    if (lockedSeconds <= 0) return;
    const timer = setInterval(() => setLockedSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [lockedSeconds]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(identifier, password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
      if (err.status === 423) {
        const match = /(\d+) second/.exec(err.message || "");
        setLockedSeconds(match ? Number(match[1]) : 60);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isLocked = lockedSeconds > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-4">
            <img src="/PGB_logo_f.png" alt="Primary Group of Builders" className="h-8 w-auto" />
            <div className="h-8 w-px bg-slate-200" />
            <img src="/EOS-logo.png" alt="EOS" className="h-10 w-auto" />
          </div>
          <span className="text-sm font-medium text-slate-500">Executive Dashboard</span>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Email or Username</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>
          {error && (
            <div
              className={`rounded-md px-3 py-2 text-sm ${isLocked ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"}`}
            >
              {isLocked ? `Too many failed attempts. Try again in ${lockedSeconds}s.` : error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || isLocked}
            className="mt-2 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {isLocked ? `Locked (${lockedSeconds}s)` : submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-xs text-slate-500">
          First time here? Log in as the superadmin with username <code>saulrhyz</code>.
        </p>
      </div>
    </div>
  );
}
