import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { BusinessUnit, Company, Year } from "../api/types";
import { useAuth } from "../contexts/AuthContext";
import { formatQuarterRange } from "../utils/quarterDates";

export interface DashboardFilters {
  yearId: string;
  quarter: number; // 0 = "All Quarters" (full year), otherwise 1-4
  businessUnitId: string; // "" means "all" (Group Integrator only)
  companyId: string; // "" means "all companies in scope"
}

interface Props {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
}

export default function FilterBar({ filters, onChange }: Props) {
  const { user } = useAuth();
  const [years, setYears] = useState<Year[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    // Default the Year/Quarter to the real current calendar quarter (per the
    // server clock) when possible, so the dashboard opens already lined up
    // with "today" instead of an arbitrary first-in-list year. Falls back to
    // the first available Year if today's Year hasn't been created yet.
    Promise.all([api.years(), api.currentQuarter().catch(() => null)]).then(([ys, current]) => {
      setYears(ys);
      if (!filters.yearId && ys.length > 0) {
        if (current?.yearId && ys.some((y) => y.id === current.yearId)) {
          onChange({ ...filters, yearId: current.yearId, quarter: current.quarter });
        } else {
          onChange({ ...filters, yearId: ys[0].id });
        }
      }
    });
    api.businessUnits().then((bus) => {
      setBusinessUnits(bus);
      // BU Integrators are scoped to their own units; default to the first assigned BU.
      if (user?.role === "BU_INTEGRATOR" && !filters.businessUnitId && bus.length > 0) {
        onChange({ ...filters, businessUnitId: bus[0].id });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.companies(filters.businessUnitId || undefined).then(setCompanies);
  }, [filters.businessUnitId]);

  const selectedYear = years.find((y) => y.id === filters.yearId)?.year;
  const quarterRangeLabel =
    selectedYear != null
      ? filters.quarter === 0
        ? `Jan 1 - Dec 31, ${selectedYear}`
        : formatQuarterRange(selectedYear, filters.quarter)
      : null;

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">Year</label>
        <select
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          value={filters.yearId}
          onChange={(e) => onChange({ ...filters, yearId: e.target.value })}
        >
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.year}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">Quarter</label>
        <select
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          value={filters.quarter}
          onChange={(e) => onChange({ ...filters, quarter: Number(e.target.value) })}
        >
          <option value={0}>All Quarters</option>
          {[1, 2, 3, 4].map((q) => (
            <option key={q} value={q}>
              Q{q}
            </option>
          ))}
        </select>
        {quarterRangeLabel && <span className="text-[11px] text-slate-500">{quarterRangeLabel}</span>}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">Business Unit</label>
        <select
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm min-w-[180px]"
          value={filters.businessUnitId}
          onChange={(e) => onChange({ ...filters, businessUnitId: e.target.value, companyId: "" })}
        >
          {(user?.role === "GROUP_INTEGRATOR" || user?.role === "SUPERADMIN") && <option value="">All Business Units</option>}
          {businessUnits.map((bu) => (
            <option key={bu.id} value={bu.id}>
              {bu.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">Company</label>
        <select
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm min-w-[180px]"
          value={filters.companyId}
          onChange={(e) => onChange({ ...filters, companyId: e.target.value })}
        >
          <option value="">All Companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
