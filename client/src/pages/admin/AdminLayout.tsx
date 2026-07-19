import { NavLink, Outlet } from "react-router-dom";
import { Users, Building2, Briefcase, Mail, ShieldCheck, ScrollText } from "lucide-react";

export default function AdminLayout() {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-slate-800">Superadmin</h2>
        <p className="text-sm text-slate-500">Manage users, companies, business units, and system settings.</p>
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
        <NavLink to="/admin/users" className={tabClass}>
          <Users className="h-4 w-4" /> Users
        </NavLink>
        <NavLink to="/admin/roles" className={tabClass}>
          <ShieldCheck className="h-4 w-4" /> Roles
        </NavLink>
        <NavLink to="/admin/companies" className={tabClass}>
          <Building2 className="h-4 w-4" /> Companies
        </NavLink>
        <NavLink to="/admin/business-units" className={tabClass}>
          <Briefcase className="h-4 w-4" /> Business Units
        </NavLink>
        <NavLink to="/admin/smtp" className={tabClass}>
          <Mail className="h-4 w-4" /> SMTP Settings
        </NavLink>
        {/* Points outside /admin/* on purpose — see the comment in App.tsx
            next to the /audit-log route for why. */}
        <NavLink to="/audit-log" className={tabClass}>
          <ScrollText className="h-4 w-4" /> Audit Log
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
