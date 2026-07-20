import { useOutletContext } from "react-router-dom";
import DisbursementCards from "../../components/DisbursementCards";
import type { FinancialsOutletContext } from "./FinancialsLayout";

// Disbursements sub-tab (/revenue/disbursements). Disbursements are
// recorded, not targeted, so there's no BU-level Target/Actual breakdown
// table for them (unlike Revenue/Collections/Expenses) — just the existing
// DisbursementCards summary, reused as-is.
export default function DisbursementsTab() {
  const { data, filters } = useOutletContext<FinancialsOutletContext>();
  if (!data) return null;
  return (
    <div className="flex flex-col gap-6">
      <DisbursementCards kpis={data.kpis} quarter={filters.quarter} />
    </div>
  );
}
