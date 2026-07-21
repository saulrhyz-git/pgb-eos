import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import FinancialsLayout from "./pages/financials/FinancialsLayout";
import RevenueTab from "./pages/financials/RevenueTab";
import CollectionsTab from "./pages/financials/CollectionsTab";
import ExpensesTab from "./pages/financials/ExpensesTab";
import DisbursementsTab from "./pages/financials/DisbursementsTab";
import Profile from "./pages/Profile";
import Scorecard from "./pages/Scorecard";
import Compare from "./pages/Compare";
import Rocks from "./pages/Rocks";
import Reports from "./pages/Reports";
import AiAnalysis from "./pages/AiAnalysis";
import IntegratorPortal from "./pages/IntegratorPortal";
import TargetConfig from "./pages/TargetConfig";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminRoles from "./pages/admin/AdminRoles";
import AdminCompanies from "./pages/admin/AdminCompanies";
import AdminBusinessUnits from "./pages/admin/AdminBusinessUnits";
import AdminSmtp from "./pages/admin/AdminSmtp";
import AdminAiSettings from "./pages/admin/AdminAiSettings";
import AdminNoteCategories from "./pages/admin/AdminNoteCategories";
import AdminAuditLog from "./pages/admin/AdminAuditLog";
import AdminLayout from "./pages/admin/AdminLayout";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-slate-500 dark:text-slate-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  return children;
}

function RequireChangePassword({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-slate-500 dark:text-slate-400">Loading...</div>;
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
        {/* Scorecard is the default landing page after login (see Login.tsx's
            navigate("/")) — Revenue moved to its own /revenue path below. */}
        <Route index element={<Scorecard />} />
        <Route path="profile" element={<Profile />} />
        <Route path="compare" element={<Compare />} />
        {/* /revenue keeps its URL (per the user's answer to keep the route
            name even though the nav label is now "Financials") but is now a
            layout route: one shared FilterBar + sub-tab nav bar in
            FinancialsLayout, with 4 real nested routes underneath so each
            category is bookmarkable and the page doesn't show all of
            Revenue/Collections/Expenses/Disbursements at once anymore. */}
        <Route path="revenue" element={<FinancialsLayout />}>
          <Route index element={<RevenueTab />} />
          <Route path="collections" element={<CollectionsTab />} />
          <Route path="expenses" element={<ExpensesTab />} />
          <Route path="disbursements" element={<DisbursementsTab />} />
        </Route>
        <Route path="rocks" element={<Rocks />} />
        <Route path="reports" element={<Reports />} />
        {/* Default access is Superadmin; a non-superadmin needs a Custom
            Role that grants AI_ANALYSIS view (403 + "access required" card
            otherwise, same pattern as Scorecard/Reports/Compare). Standalone
            top-level route, not nested under /admin — the AI Analysis page
            itself is a working page any authorized user should reach, not
            an admin-management page (that's AdminAiSettings below, which
            configures the Gemini API key and IS Superadmin-only). */}
        <Route path="ai-analysis" element={<AiAnalysis />} />
        {/* Disbursements (Advances/Loan Repayments/Interests) used to be
            their own top-level tab with three sub-pages; they're now folded
            into this single Data Entry page (see IntegratorPortal.tsx) so
            there's just one Data Entry tab covering every recorded figure. */}
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
          <Route path="ai-settings" element={<AdminAiSettings />} />
          <Route path="note-categories" element={<AdminNoteCategories />} />
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
