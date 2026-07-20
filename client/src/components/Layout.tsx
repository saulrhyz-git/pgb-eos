import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardEdit,
  Settings,
  LogOut,
  ShieldCheck,
  Mountain,
  Gauge,
  UserCircle,
  ScrollText,
  FileSpreadsheet,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-100"
    }`;

  // Same link list is rendered twice: as a horizontal row on md+ screens, and
  // as a stacked column inside the mobile dropdown below md. Closing the menu
  // on click keeps the dropdown from staying open after navigating.
  const navLinks = (
    <>
      <NavLink to="/" end className={linkClass} onClick={() => setMenuOpen(false)}>
        <Gauge className="h-4 w-4" /> Scorecard
      </NavLink>
      <NavLink to="/revenue" className={linkClass} onClick={() => setMenuOpen(false)}>
        <LayoutDashboard className="h-4 w-4" /> Revenue
      </NavLink>
      <NavLink to="/rocks" className={linkClass} onClick={() => setMenuOpen(false)}>
        <Mountain className="h-4 w-4" /> Rocks
      </NavLink>
      <NavLink to="/data-entry" className={linkClass} onClick={() => setMenuOpen(false)}>
        <ClipboardEdit className="h-4 w-4" /> Data Entry
      </NavLink>
      <NavLink to="/targets" className={linkClass} onClick={() => setMenuOpen(false)}>
        <Settings className="h-4 w-4" /> Target Setup
      </NavLink>
      {/* Shown unconditionally, same as Scorecard/Rocks — the backend is the
          real gate (Superadmin/Group Integrator by default, or a Custom Role
          granting REPORTS view), and anyone without access just sees the
          "access required" card on the page itself. */}
      <NavLink to="/reports" className={linkClass} onClick={() => setMenuOpen(false)}>
        <FileSpreadsheet className="h-4 w-4" /> Reports
      </NavLink>
      {/* Superadmins already reach the Audit Log via the Admin tab bar
          below — this link is only for non-superadmins who've been
          granted AUDIT_LOG view through a Custom Role, since they can
          never reach /admin (it's client-side gated to SUPERADMIN).
          Shown unconditionally to every non-superadmin, same as
          Scorecard: the backend is the real gate, and anyone without
          access just sees the "access required" card. */}
      {user?.role !== "SUPERADMIN" && (
        <NavLink to="/audit-log" className={linkClass} onClick={() => setMenuOpen(false)}>
          <ScrollText className="h-4 w-4" /> Audit Log
        </NavLink>
      )}
      {user?.role === "SUPERADMIN" && (
        <NavLink to="/admin" className={linkClass} onClick={() => setMenuOpen(false)}>
          <ShieldCheck className="h-4 w-4" /> Admin
        </NavLink>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img src="/EOS-logo.png" alt="EOS" className="h-7 w-auto shrink-0 sm:h-9" />
            <span className="hidden truncate text-lg font-semibold text-slate-800 sm:inline">
              Executive Dashboard
            </span>
          </div>
          {/* Full nav row, md+ only */}
          <nav className="hidden items-center gap-1 md:flex lg:gap-2">{navLinks}</nav>
          <div className="flex items-center gap-1 sm:gap-3">
            <Link
              to="/profile"
              className="hidden text-right hover:opacity-80 sm:block"
              title="My Profile"
            >
              <div className="text-sm font-medium text-slate-800">{user?.name}</div>
              {user?.description && <div className="text-xs text-slate-500">{user.description}</div>}
            </Link>
            <Link
              to="/profile"
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title="My Profile"
            >
              <UserCircle className="h-4 w-4" />
            </Link>
            <button
              onClick={logout}
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
            {/* Hamburger toggle, below md only */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 md:hidden"
              title="Menu"
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {/* Mobile dropdown nav, below md only */}
        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-slate-200 px-4 py-2 md:hidden">
            {navLinks}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
}
