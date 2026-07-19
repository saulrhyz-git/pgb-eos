import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { DashboardResponse } from "../api/types";
import FilterBar, { DashboardFilters } from "../components/FilterBar";
import KpiCards from "../components/KpiCards";
import ProgressChart from "../components/ProgressChart";
import TargetMatrix from "../components/TargetMatrix";
import OperationalGrid from "../components/OperationalGrid";

export default function Dashboard() {
  // Placeholder values only — FilterBar's own effect immediately overwrites
  // yearId/quarter with the real current Year+Quarter (and businessUnitId
  // for a BU Integrator, who has no "all" option) as soon as it loads, so
  // this component never actually fetches with these defaults. An empty
  // yearId/businessUnitId/companyId already means "current"/"all" — see
  // DashboardFilters above.
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
      .catch((err) => setError(err.message || "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <FilterBar filters={filters} onChange={setFilters} />

      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      {data && (
        <>
          <KpiCards kpis={data.kpis} quarter={filters.quarter} />
          <ProgressChart chart={data.chart} />
          <TargetMatrix rows={data.targetMatrix} />
          <OperationalGrid
            rows={data.operationalGrid}
            yearId={filters.yearId}
            quarter={filters.quarter}
            onRemarksSaved={load}
          />
        </>
      )}

      {loading && !data && <div className="py-12 text-center text-slate-500">Loading dashboard...</div>}
    </div>
  );
}
