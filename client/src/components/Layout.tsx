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
  Mountain,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCircle,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

// Persists whether the desktop sidebar is collapsed to icon-only across
// reloads — purely a display preference, not app data, so plain
// localStorage (rather than a backend setting) is the right place for it.
const SIDEBAR_COLLAPSED_KEY = "eos_sidebar_collapsed";

export default function Layout() {
  const { user, logout } = useAuth();

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
      isActive ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-100"
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
        {/* Label-only rename to "Financials" — the route itself stays
            /revenue (see FinancialsLayout in App.tsx) since nothing else
            about the URL needed to change. */}
        <NavLink to="/revenue" className={linkClass} onClick={closeMobile} title="Financials">
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          {showLabels && "Financials"}
        </NavLink>
        <NavLink to="/rocks" className={linkClass} onClick={closeMobile} title="Rocks">
          <Mountain className="h-4 w-4 shrink-0" />
          {showLabels && "Rocks"}
        </NavLink>
        <NavLink to="/compare" className={linkClass} onClick={closeMobile} title="Compare">
          <GitCompare className="h-4 w-4 shrink-0" />
          {showLabels && "Compare"}
        </NavLink>

        <NavLink to="/data-entry" className={linkClass} onClick={closeMobile} title="Data Entry">
          <ClipboardEdit className="h-4 w-4 shrink-0" />
          {showLabels && "Data Entry"}
        </NavLink>
        <NavLink to="/targets" className={linkClass} onClick={closeMobile} title="Target Setup">
          <Settings className="h-4 w-4 shrink-0" />
          {showLabels && "Target Setup"}
        </NavLink>
        <NavLink to="/reports" className={linkClass} onClick={closeMobile} title="Reports">
          <FileSpreadsheet className="h-4 w-4 shrink-0" />
          {showLabels && "Reports"}
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
    <div className="flex min-h-screen bg-slate-50">
      {/* ---------- Desktop sidebar (collapsible icon-only / icon+label) ---------- */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 md:flex ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div className={`flex items-center gap-2 border-b border-slate-200 px-3 py-3 ${collapsed ? "justify-center" : "justify-between"}`}>
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
            {!collapsed && <span className="truncate text-sm font-semibold text-slate-800">Executive Dashboard</span>}
          </button>
          {/* Always visible when expanded — a second, explicit way to
              collapse the sidebar for anyone who doesn't notice the logo
              itself is clickable. Its icon direction communicates what
              clicking it will do. */}
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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
          className="flex items-center justify-center gap-2 border-t border-slate-200 p-3 text-xs font-medium text-slate-500 hover:bg-slate-100"
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
          <div onClick={(e) => e.stopPropagation()} className="relative flex h-full w-64 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
              <div className="flex items-center gap-2">
                <img src="/EOS-logo.png" alt="EOS" className="h-7 w-auto shrink-0" />
                <span className="truncate text-sm font-semibold text-slate-800">Executive Dashboard</span>
              </div>
              <button onClick={closeMobile} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close navigation menu">
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
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileOpen(true)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 md:hidden"
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
              <Link to="/profile" className="hidden text-right hover:opacity-80 sm:block" title="My Profile">
                <div className="text-sm font-medium text-slate-800">{user?.name}</div>
                {user?.description && <div className="text-xs text-slate-500">{user.description}</div>}
              </Link>
              <Link to="/profile" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="My Profile">
                <UserCircle className="h-4 w-4" />
              </Link>
              <button onClick={logout} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Log out">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 sm:px-6 sm:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
