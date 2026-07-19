import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Scorecard from "./pages/Scorecard";
import Rocks from "./pages/Rocks";
import IntegratorPortal from "./pages/IntegratorPortal";
import TargetConfig from "./pages/TargetConfig";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminRoles from "./pages/admin/AdminRoles";
import AdminCompanies from "./pages/admin/AdminCompanies";
import AdminBusinessUnits from "./pages/admin/AdminBusinessUnits";
import AdminSmtp from "./pages/admin/AdminSmtp";
import AdminAuditLog from "./pages/admin/AdminAuditLog";
import AdminLayout from "./pages/admin/AdminLayout";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  return children;
}

function RequireChangePassword({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireSuperAdmin({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (user?.role !== "SUPERADMIN") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/change-password"
        element={
          <RequireChangePassword>
            <ChangePassword />
          </RequireChangePassword>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="profile" element={<Profile />} />
        <Route path="scorecard" element={<Scorecard />} />
        <Route path="rocks" element={<Rocks />} />
        <Route path="data-entry" element={<IntegratorPortal />} />
        <Route path="targets" element={<TargetConfig />} />
        {/* This top-level /audit-log route exists only so a non-superadmin
            granted AUDIT_LOG view through a Custom Role has a way to reach
            the page at all, since /admin/* below is entirely gated by
            RequireSuperAdmin. Superadmins should use the nested
            /admin/audit-log route instead (linked from AdminLayout's tab
            bar) so the tab bar stays visible while they're on it, same as
            every other Admin tab — see the note there. The backend is the
            real access check either way (SUPERADMIN or a Custom Role with
            AUDIT_LOG view); AdminAuditLog.tsx's "forbidden" state covers
            anyone without it, same pattern as /scorecard. */}
        <Route path="audit-log" element={<AdminAuditLog />} />
        <Route
          path="admin"
          element={
            <RequireSuperAdmin>
              <AdminLayout />
            </RequireSuperAdmin>
          }
        >
          <Route index element={<Navigate to="users" replace />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="roles" element={<AdminRoles />} />
          <Route path="companies" element={<AdminCompanies />} />
          <Route path="business-units" element={<AdminBusinessUnits />} />
          <Route path="smtp" element={<AdminSmtp />} />
          {/* Nested (unlike the top-level /audit-log above) so the tab bar
              in AdminLayout stays mounted/visible while a Superadmin is on
              this page, exactly like every other Admin tab. */}
          <Route path="audit-log" element={<AdminAuditLog />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
