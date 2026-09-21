import { useOutletContext } from "react-router-dom";
import KpiCards from "../../components/KpiCards";
import TargetMatrix from "../../components/TargetMatrix";
import OperationalGrid from "../../components/OperationalGrid";
import NotableItemsList from "../../components/NotableItemsList";
import type { FinancialsOutletContext } from "./FinancialsLayout";

// Collections-only sub-tab (/revenue/collections). No ProgressChart here —
// that chart is backed by dashboard.ts's revenue-only `chart` field and
// stays exclusive to the Revenue tab.
export default function CollectionsTab() {
  const { data, filters, reload } = useOutletContext<FinancialsOutletContext>();
  if (!data) return null;
  return (
    <div className="flex flex-col gap-6">
      <KpiCards kpis={data.kpis} quarter={filters.quarter} category="COLLECTIONS" />
      <TargetMatrix rows={data.targetMatrix} category="collections" />
      <OperationalGrid rows={data.operationalGrid} yearId={filters.yearId} quarter={filters.quarter} onRemarksSaved={reload} category="COLLECTIONS" />
      <NotableItemsList
        title="Notable Collections Items"
        type="COLLECTION"
        yearId={filters.yearId}
        quarter={filters.quarter}
        businessUnitId={filters.businessUnitId}
        companyId={filters.companyId}
      />
    </div>
  );
}
