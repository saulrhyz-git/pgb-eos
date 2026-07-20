import { useOutletContext } from "react-router-dom";
import KpiCards from "../../components/KpiCards";
import ProgressChart from "../../components/ProgressChart";
import TargetMatrix from "../../components/TargetMatrix";
import OperationalGrid from "../../components/OperationalGrid";
import type { FinancialsOutletContext } from "./FinancialsLayout";

// Index route of the Financials section (/revenue) — the Revenue-only slice
// of what used to be the single, all-categories Dashboard.tsx. Data comes
// from FinancialsLayout's one shared fetch via Outlet context, not its own
// fetch, since all 4 sub-tabs share one FilterBar/scope.
export default function RevenueTab() {
  const { data, filters, reload } = useOutletContext<FinancialsOutletContext>();
  if (!data) return null;
  return (
    <div className="flex flex-col gap-6">
      <KpiCards kpis={data.kpis} quarter={filters.quarter} category="REVENUE" />
      <ProgressChart chart={data.chart} />
      <TargetMatrix rows={data.targetMatrix} category="revenue" />
      <OperationalGrid rows={data.operationalGrid} yearId={filters.yearId} quarter={filters.quarter} onRemarksSaved={reload} category="REVENUE" />
    </div>
  );
}
