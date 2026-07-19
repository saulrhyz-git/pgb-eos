import { Link, NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, ClipboardEdit, Settings, LogOut, TrendingUp, ShieldCheck, Mountain, Gauge, UserCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-brand-600" />
            <span className="text-lg font-semibold text-slate-800">EOS Executive Dashboard</span>
          </div>
          <nav className="flex items-center gap-2">
            <NavLink to="/" end className={linkClass}>
              <LayoutDashboard className="h-4 w-4" /> Revenue
            </NavLink>
            <NavLink to="/scorecard" className={linkClass}>
              <Gauge className="h-4 w-4" /> Scorecard
            </NavLink>
            <NavLink to="/rocks" className={linkClass}>
              <Mountain className="h-4 w-4" /> Rocks
            </NavLink>
            <NavLink to="/data-entry" className={linkClass}>
              <ClipboardEdit className="h-4 w-4" /> Data Entry
            </NavLink>
            <NavLink to="/targets" className={linkClass}>
              <Settings className="h-4 w-4" /> Target Setup
            </NavLink>
            {user?.role === "SUPERADMIN" && (
              <NavLink to="/admin" className={linkClass}>
                <ShieldCheck className="h-4 w-4" /> Admin
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/profile" className="text-right hover:opacity-80" title="My Profile">
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
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
