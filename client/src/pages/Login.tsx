import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";

export default function Login() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-8">
      {/* Reachable before login too — the toggle in the main app's header
          (Layout.tsx) only exists once someone's signed in, so this is the
          only way to switch themes on the very first screen. */}
      <button
        onClick={toggleTheme}
        className="absolute right-4 top-4 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-4">
            <img src="/PGB_logo_f.png" alt="Primary Group of Builders" className="h-8 w-auto" />
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
            <img src="/EOS-logo.png" alt="EOS" className="h-10 w-auto" />
          </div>
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Executive Dashboard</span>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Email or Username</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 px-3 py-2 text-sm"
              required
            />
          </div>
          {error && (
            <div
              className={`rounded-md px-3 py-2 text-sm ${isLocked ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"}`}
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
        <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
          First time here? Log in as the superadmin with username <code>saulrhyz</code>.
        </p>
      </div>
    </div>
  );
}
