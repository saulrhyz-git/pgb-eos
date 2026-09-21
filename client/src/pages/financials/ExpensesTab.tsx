import { useOutletContext } from "react-router-dom";
import KpiCards from "../../components/KpiCards";
import TargetMatrix from "../../components/TargetMatrix";
import OperationalGrid from "../../components/OperationalGrid";
import NotableItemsList from "../../components/NotableItemsList";
import type { FinancialsOutletContext } from "./FinancialsLayout";

// Expenses-only sub-tab (/revenue/expenses).
export default function ExpensesTab() {
  const { data, filters, reload } = useOutletContext<FinancialsOutletContext>();
  if (!data) return null;
  return (
    <div className="flex flex-col gap-6">
      <KpiCards kpis={data.kpis} quarter={filters.quarter} category="EXPENSES" />
      <TargetMatrix rows={data.targetMatrix} category="expenses" />
      <OperationalGrid rows={data.operationalGrid} yearId={filters.yearId} quarter={filters.quarter} onRemarksSaved={reload} category="EXPENSES" />
      <NotableItemsList
        title="Notable Expense Items"
        type="EXPENSE"
        yearId={filters.yearId}
        quarter={filters.quarter}
        businessUnitId={filters.businessUnitId}
        companyId={filters.companyId}
      />
    </div>
  );
}
