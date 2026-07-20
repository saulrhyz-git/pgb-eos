import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Wallet, Receipt, HandCoins } from "lucide-react";
import { api } from "../../api/client";
import type { DashboardResponse } from "../../api/types";
import FilterBar, { DashboardFilters } from "../../components/FilterBar";

// Shared context handed down to each of the 4 leaf tabs below via
// react-router's Outlet context (React Router v6) — one shared FilterBar and
// one shared fetch of /dashboard feeds all 4 sub-tabs, per the user's
// answer that filters should NOT be independent per sub-tab. Each leaf pulls
// this with useOutletContext<FinancialsOutletContext>().
export interface FinancialsOutletContext {
  data: DashboardResponse | null;
  filters: DashboardFilters;
  loading: boolean;
  reload: () => void;
}

// This used to be the whole of Dashboard.tsx (Revenue/Collections/Expenses/
// Disbursements all rendered in one long unbroken page). It's now just the
// shared chrome — FilterBar + a sub-tab nav bar modeled on AdminLayout.tsx's
// tab bar pattern — with the actual category content living in 4 separate
// leaf route components, to declutter what used to be one very long page.
export default function FinancialsLayout() {
  const [filters, setFilters] = useState<DashboardFilters>({
    yearId: "",
    quarter: 1,
    businessUnitId: "",
    companyId: "",
  });
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!filters.yearId) return;
    setLoading(true);
    setError("");
    api
      .dashboard(filters)
      .then(setData)
      .catch((err) => setError(err.message || "Failed to load Financials data"))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors sm:gap-2 sm:px-3 sm:text-sm ${
      isActive ? "bg-brand-500 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
    }`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100">Financials</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Revenue, Collections, Expenses, and Disbursements for the selected scope.</p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      <nav className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-700 pb-4 sm:gap-2">
        <NavLink to="/revenue" end className={tabClass}>
          <LayoutDashboard className="h-4 w-4" /> Revenue
        </NavLink>
        <NavLink to="/revenue/collections" className={tabClass}>
          <Wallet className="h-4 w-4" /> Collections
        </NavLink>
        <NavLink to="/revenue/expenses" className={tabClass}>
          <Receipt className="h-4 w-4" /> Expenses
        </NavLink>
        <NavLink to="/revenue/disbursements" className={tabClass}>
          <HandCoins className="h-4 w-4" /> Disbursements
        </NavLink>
      </nav>

      {error && <div className="rounded-md bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

      {data ? (
        <Outlet context={{ data, filters, loading, reload: load } satisfies FinancialsOutletContext} />
      ) : (
        loading && <div className="py-12 text-center text-slate-500 dark:text-slate-400">Loading Financials...</div>
      )}
    </div>
  );
}
