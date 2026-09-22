import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  ChevronsLeft,
  ChevronsRight,
  ClipboardEdit,
  FileSpreadsheet,
  Gauge,
  GitCompare,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Mountain,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  UserCircle,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";

// Persists whether the desktop sidebar is collapsed to icon-only across
// reloads — purely a display preference, not app data, so plain
// localStorage (rather than a backend setting) is the right place for it.
const SIDEBAR_COLLAPSED_KEY = "eos_sidebar_collapsed";

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  function closeMobile() {
    setMobileOpen(false);
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? "bg-brand-500 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
    }`;

  // Rendered twice (desktop sidebar + mobile drawer) so both stay in sync
  // off one definition. `showLabels` is false only for the collapsed desktop
  // sidebar (icon-only); the mobile drawer always passes true since it isn't
  // space-constrained the same way.
  function NavContent({ showLabels }: { showLabels: boolean }) {
    return (
      <>
        <NavLink to="/" end className={linkClass} onClick={closeMobile} title="Scorecard">
          <Gauge className="h-4 w-4 shrink-0" />
          {showLabels && "Scorecard"}
        </NavLink>
        <NavLink to="/rocks" className={linkClass} onClick={closeMobile} title="Rocks">
          <Mountain className="h-4 w-4 shrink-0" />
          {showLabels && "Rocks"}
        </NavLink>
        {/* Label-only rename to "Financials Dashboard" — the route itself
            stays /revenue (see FinancialsLayout in App.tsx) since nothing
            else about the URL needed to change. */}
        <NavLink to="/revenue" className={linkClass} onClick={closeMobile} title="Financials Dashboard">
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          {showLabels && "Financials Dashboard"}
        </NavLink>
        {/* Label-only rename to "Financials Data Entry" — route stays
            /data-entry. */}
        <NavLink to="/data-entry" className={linkClass} onClick={closeMobile} title="Financials Data Entry">
          <ClipboardEdit className="h-4 w-4 shrink-0" />
          {showLabels && "Financials Data Entry"}
        </NavLink>
        {/* Label-only rename to "Financials Target Setup" — route stays
            /targets. */}
        <NavLink to="/targets" className={linkClass} onClick={closeMobile} title="Financials Target Setup">
          <Settings className="h-4 w-4 shrink-0" />
          {showLabels && "Financials Target Setup"}
        </NavLink>
        <NavLink to="/compare" className={linkClass} onClick={closeMobile} title="Compare">
          <GitCompare className="h-4 w-4 shrink-0" />
          {showLabels && "Compare"}
        </NavLink>
        <NavLink to="/reports" className={linkClass} onClick={closeMobile} title="Reports">
          <FileSpreadsheet className="h-4 w-4 shrink-0" />
          {showLabels && "Reports"}
        </NavLink>
        {/* Default access is Superadmin; shown unconditionally to everyone
            (same as Scorecard/Reports/Audit Log) since the backend is the
            real gate — a user without AI_ANALYSIS view just sees the
            "access required" card. */}
        <NavLink to="/ai-analysis" className={linkClass} onClick={closeMobile} title="AI Analysis">
          <Sparkles className="h-4 w-4 shrink-0" />
          {showLabels && "AI Analysis"}
        </NavLink>
        {/* Superadmins already reach the Audit Log via the Admin tab bar —
            this link is only for non-superadmins who've been granted
            AUDIT_LOG view through a Custom Role, since they can never reach
            /admin (it's client-side gated to SUPERADMIN). Shown
            unconditionally to every non-superadmin, same as Scorecard/
            Reports: the backend is the real gate, and anyone without access
            just sees the "access required" card. */}
        {user?.role !== "SUPERADMIN" && (
          <NavLink to="/audit-log" className={linkClass} onClick={closeMobile} title="Audit Log">
            <ScrollText className="h-4 w-4 shrink-0" />
            {showLabels && "Audit Log"}
          </NavLink>
        )}
        {user?.role === "SUPERADMIN" && (
          <NavLink to="/admin" className={linkClass} onClick={closeMobile} title="Admin">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            {showLabels && "Admin"}
          </NavLink>
        )}
      </>
    );
  }

  return (
    // min-h-dvh (not min-h-screen/100vh) so the root container tracks the
    // real visible viewport height on mobile as the browser's address bar
    // shows/hides, rather than always reserving a fixed 100vh that can run
    // taller than what's actually visible — see the matching note in
    // index.css.
    <div className="flex min-h-dvh bg-slate-50 dark:bg-slate-950">
      {/* ---------- Desktop sidebar (collapsible icon-only / icon+label) ---------- */}
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 transition-[width] duration-200 md:flex ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {/* pt- adds the safe-area inset on top of the existing py-3 rather
            than replacing it, so there's still normal padding on devices/
            orientations with no unsafe area (env() resolves to 0 there). */}
        <div
          className={`flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] ${collapsed ? "justify-center" : "justify-between"}`}
        >
          {/* The logo itself doubles as a collapse/expand toggle — clicking
              it anywhere (collapsed or expanded) flips `collapsed`, same
              action as the dedicated chevron buttons below, just faster to
              reach since it's always the first thing in the sidebar. */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex min-w-0 items-center gap-2 rounded-md hover:opacity-80"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <img src="/EOS-logo.png" alt="EOS" className="h-7 w-auto shrink-0" />
            {!collapsed && <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">Executive Dashboard</span>}
          </button>
          {/* Always visible when expanded — a second, explicit way to
              collapse the sidebar for anyone who doesn't notice the logo
              itself is clickable. Its icon direction communicates what
              clicking it will do. */}
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="shrink-0 rounded-md p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          )}
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          <NavContent showLabels={!collapsed} />
        </nav>
        {/* Collapsed state repeats the toggle here (full-width, at the
            bottom) since the header row above hides it to save space —
            this is the way to expand back out. */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center justify-center gap-2 border-t border-slate-200 dark:border-slate-700 p-3 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronsLeft className="h-4 w-4" /> Collapse
            </>
          )}
        </button>
      </aside>

      {/* ---------- Mobile slide-in drawer (below md only) ---------- */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={closeMobile}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <div onClick={(e) => e.stopPropagation()} className="relative flex h-full w-64 flex-col bg-white dark:bg-slate-900 shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
              <div className="flex items-center gap-2">
                <img src="/EOS-logo.png" alt="EOS" className="h-7 w-auto shrink-0" />
                <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">Executive Dashboard</span>
              </div>
              <button onClick={closeMobile} className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Close navigation menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
              <NavContent showLabels={true} />
            </nav>
          </div>
        </div>
      )}

      {/* ---------- Main column ---------- */}
      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2 py-3 pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] sm:pl-[calc(1.5rem+env(safe-area-inset-left))] sm:pr-[calc(1.5rem+env(safe-area-inset-right))]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileOpen(true)}
                className="rounded-md p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 md:hidden"
                title="Menu"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              {/* The desktop sidebar already carries the logo/title — this is
                  shown only on mobile, where the sidebar is hidden. */}
              <img src="/EOS-logo.png" alt="EOS" className="h-7 w-auto shrink-0 md:hidden" />
            </div>
            <div className="flex items-center gap-1 sm:gap-3">
              <button
                onClick={toggleTheme}
                className="rounded-md p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <Link to="/profile" className="hidden text-right hover:opacity-80 sm:block" title="My Profile">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{user?.name}</div>
                {user?.description && <div className="text-xs text-slate-500 dark:text-slate-400">{user.description}</div>}
              </Link>
              <Link to="/profile" className="rounded-md p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100" title="My Profile">
                <UserCircle className="h-4 w-4" />
              </Link>
              <button onClick={logout} className="rounded-md p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100" title="Log out">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
        {/* pb- adds the home-indicator safe-area inset on top of the
            existing py-4/py-6 rather than replacing it (env() resolves to
            0 on devices/orientations with no unsafe area, so this is a
            no-op there). */}
        <main className="mx-auto w-full max-w-7xl flex-1 pb-[calc(1rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] pt-4 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pl-[calc(1.5rem+env(safe-area-inset-left))] sm:pr-[calc(1.5rem+env(safe-area-inset-right))] sm:pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
