import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import IntegratorPortal from "./pages/IntegratorPortal";
import TargetConfig from "./pages/TargetConfig";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireGroupIntegrator({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (user?.role !== "GROUP_INTEGRATOR") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="data-entry" element={<IntegratorPortal />} />
        <Route
          path="targets"
          element={
            <RequireGroupIntegrator>
              <TargetConfig />
            </RequireGroupIntegrator>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
