import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Gauge, Mountain, PhilippinePeso, Printer, ShieldAlert } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import Pagination from "../components/Pagination";
import SortableTh from "../components/SortableTh";
import type { BusinessGoal, BusinessUnit, Company, ReportResult, RockStatus, Year } from "../api/types";

// The Reports engine: a filterable, exportable view over the same
// Targets/Actuals and Rocks data every other page already shows. Every
// report type below (Financial Performance, Rocks, Executive Summary)
// resolves to the same generic { title, scope, columns, rows } shape (see
// ReportResult in ../api/types and server/src/routes/reports.ts), so this
// whole page renders and exports ANY of them with one generic table +
// CSV/print renderer instead of bespoke UI per report.
//
// Export note: this sandbox has no access to the npm registry, so true
// binary .xlsx/.pdf generation (which would need packages like `exceljs` or
// `pdfkit`) isn't available. "Export to Excel" instead downloads a .csv file
// (opens natively in Excel/Sheets); "Export to PDF" opens a print-formatted
// view and hands off to the browser's native print-to-PDF dialog. Both are
// clearly labeled in the UI so this isn't a silent downgrade.

type ReportType = "financial" | "rocks" | "executive-summary";

const REPORT_TABS: { key: ReportType; label: string; icon: React.ReactNode }[] = [
  { key: "financial", label: "Financial Performance", icon: <PhilippinePeso className="h-4 w-4" /> },
  { key: "rocks", label: "Rocks", icon: <Mountain className="h-4 w-4" /> },
  { key: "executive-summary", label: "Executive Summary", icon: <Gauge className="h-4 w-4" /> },
];

const REPORTS_PAGE_SIZE = 10;

const STATUS_LABELS: Record<RockStatus, string> = {
  PENDING: "Pending",
  ON_TRACK: "On Track",
  AT_RISK: "At Risk",
  TARGET_MET: "Target Met",
};

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function buildCsv(data: ReportResult): string {
  const header = data.columns.map((c) => csvEscape(c.label)).join(",");
  const lines = data.rows.map((row) => data.columns.map((c) => csvEscape(String(row[c.key] ?? ""))).join(","));
  return [header, ...lines].join("\n");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Percentage columns are conventionally suffixed "Pct" across every report's
// column keys (revenueAttainmentPct, progressPct, rocksAvgProgressPct, ...) —
// checking the suffix here means the renderer never needs a per-report list
// of which columns are percentages.
function formatCellValue(value: string | number | undefined, columnKey: string, type: "text" | "number"): string {
  if (value === undefined || value === null) return "";
  if (type !== "number") return String(value);
  const n = Number(value);
  if (columnKey.endsWith("Pct")) return `${n.toFixed(1)}%`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function Reports() {
  const { user } = useAuth();
  const canSeeAllBUs = user?.role === "GROUP_INTEGRATOR" || user?.role === "SUPERADMIN";

  const [reportType, setReportType] = useState<ReportType>("financial");

  const [years, setYears] = useState<Year[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [businessGoals, setBusinessGoals] = useState<BusinessGoal[]>([]);

  const [yearId, setYearId] = useState("");
  const [quarter, setQuarter] = useState(0); // 0 = All Quarters
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [businessGoalId, setBusinessGoalId] = useState("");
  const [status, setStatus] = useState<RockStatus | "">("");

  const [data, setData] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "", dir: "asc" });
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.years().then((ys) => {
      setYears(ys);
      if (!yearId && ys.length > 0) {
        api
          .currentQuarter()
          .catch(() => null)
          .then((current) => {
            if (current?.yearId && ys.some((y) => y.id === current.yearId)) setYearId(current.yearId);
            else setYearId(ys[0].id);
          });
      }
    });
    api.businessUnits().then((bus) => {
      setBusinessUnits(bus);
      if (!canSeeAllBUs && !businessUnitId && bus.length > 0) setBusinessUnitId(bus[0].id);
    });
    api.businessGoals().then(setBusinessGoals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.companies(businessUnitId || undefined).then(setCompanies);
  }, [businessUnitId]);

  // Executive Summary has no Company/Business Goal/Status drill-down on the
  // backend (it's a per-Business-Unit rollup, same scope as the Scorecard) —
  // clear those filters when switching to it so a stale selection can't
  // silently do nothing.
  useEffect(() => {
    if (reportType === "executive-summary") {
      setCompanyId("");
      setBusinessGoalId("");
      setStatus("");
    }
  }, [reportType]);

  function loadReport() {
    if (!yearId) return;
    setLoading(true);
    setError("");
    setForbidden(false);
    const base = { yearId, quarter: quarter || undefined, businessUnitId: businessUnitId || undefined };
    const req =
      reportType === "financial"
        ? api.reportFinancial({ ...base, companyId: companyId || undefined })
        : reportType === "rocks"
        ? api.reportRocks({
            ...base,
            companyId: companyId || undefined,
            businessGoalId: businessGoalId || undefined,
            status: status || undefined,
          })
        : api.reportExecutiveSummary(base);

    req
      .then((result) => {
        setData(result);
        setSort({ key: result.columns[0]?.key || "", dir: "asc" });
        setPage(1);
      })
      .catch((err) => {
        if (err.status === 403) setForbidden(true);
        else setError(err.message || "Failed to load report");
        setData(null);
      })
      .finally(() => setLoading(false));
  }

  useEffect(loadReport, [reportType, yearId, quarter, businessUnitId, companyId, businessGoalId, status]);

  const columnType = useMemo(() => {
    const map = new Map<string, "text" | "number">();
    data?.columns.forEach((c) => map.set(c.key, c.type));
    return map;
  }, [data]);

  const sortedRows = useMemo(() => {
    if (!data) return [];
    const rows = [...data.rows];
    const type = columnType.get(sort.key) || "text";
    rows.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const cmp = type === "number" ? (Number(av) || 0) - (Number(bv) || 0) : String(av ?? "").localeCompare(String(bv ?? ""));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data, sort, columnType]);

  const pagedRows = sortedRows.slice((page - 1) * REPORTS_PAGE_SIZE, page * REPORTS_PAGE_SIZE);

  function handleSort(key: string) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  }

  const periodLabel = quarter === 0 ? "All Quarters" : `Q${quarter}`;
  const scopeSummary = useMemo(() => {
    const parts: { label: string; value: string }[] = [
      { label: "Year", value: String(years.find((y) => y.id === yearId)?.year ?? "—") },
      { label: "Period", value: periodLabel },
      { label: "Business Unit", value: businessUnitId ? businessUnits.find((b) => b.id === businessUnitId)?.name || "—" : "All Business Units" },
    ];
    if (reportType !== "executive-summary") {
      parts.push({ label: "Company", value: companyId ? companies.find((c) => c.id === companyId)?.name || "—" : "All Companies" });
    }
    if (reportType === "rocks") {
      parts.push({ label: "Business Goal", value: businessGoalId ? businessGoals.find((g) => g.id === businessGoalId)?.name || "—" : "All Business Goals" });
      parts.push({ label: "Status", value: status ? STATUS_LABELS[status] : "All Statuses" });
    }
    return parts;
  }, [years, yearId, periodLabel, businessUnitId, businessUnits, reportType, companyId, companies, businessGoalId, businessGoals, status]);

  function handleExportCsv() {
    if (!data) return;
    const csv = buildCsv(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(data.title)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleExportPdf() {
    if (!data) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const scopeHtml = scopeSummary.map((s) => `<div><strong>${escapeHtml(s.label)}:</strong> ${escapeHtml(s.value)}</div>`).join("");
    const headerRow = data.columns.map((c) => `<th class="${c.type === "number" ? "num" : ""}">${escapeHtml(c.label)}</th>`).join("");
    const bodyRows = sortedRows
      .map(
        (row) =>
          `<tr>${data.columns
            .map((c) => `<td class="${c.type === "number" ? "num" : ""}">${escapeHtml(formatCellValue(row[c.key], c.key, c.type))}</td>`)
            .join("")}</tr>`
      )
      .join("");
    win.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>${escapeHtml(data.title)}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #1e293b; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .scope { font-size: 12px; color: #475569; margin-bottom: 16px; display: flex; gap: 16px; flex-wrap: wrap; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
      th { background: #f1f5f9; }
      td.num, th.num { text-align: right; }
      @media print { body { padding: 0; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(data.title)}</h1>
    <div class="scope">${scopeHtml}</div>
    <table>
      <thead><tr>${headerRow}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </body>
</html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  if (forbidden) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
        <ShieldAlert className="h-10 w-10 text-slate-300" />
        <h2 className="text-lg font-semibold text-slate-700">Reports access required</h2>
        <p className="max-w-md text-sm text-slate-500">
          You don't currently have access to the Reports engine. Ask a Superadmin to grant your account (or a Custom Role
          assigned to you) view access to Reports.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-xl font-bold text-slate-800">Reports</h2>
        <p className="text-sm text-slate-500">Filter and export a flat, spreadsheet-ready view of Targets/Actuals and Rocks data.</p>
      </div>

      {/* Report type tabs */}
      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setReportType(tab.key)}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              reportType === tab.key ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:flex sm:flex-wrap sm:items-end sm:gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Year</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:w-auto"
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
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
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:w-auto"
            value={quarter}
            onChange={(e) => setQuarter(Number(e.target.value))}
          >
            <option value={0}>All Quarters</option>
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>
                Q{q}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Business Unit</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:min-w-[160px]"
            value={businessUnitId}
            onChange={(e) => {
              setBusinessUnitId(e.target.value);
              setCompanyId("");
            }}
          >
            {canSeeAllBUs && <option value="">All Business Units</option>}
            {businessUnits.map((bu) => (
              <option key={bu.id} value={bu.id}>
                {bu.name}
              </option>
            ))}
          </select>
        </div>
        {reportType !== "executive-summary" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Company</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:min-w-[160px]"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">All Companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {reportType === "rocks" && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Business Goal</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:min-w-[160px]"
                value={businessGoalId}
                onChange={(e) => setBusinessGoalId(e.target.value)}
              >
                <option value="">All Business Goals</option>
                {businessGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Status</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:w-auto"
                value={status}
                onChange={(e) => setStatus(e.target.value as RockStatus | "")}
              >
                <option value="">All Statuses</option>
                {(Object.keys(STATUS_LABELS) as RockStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      {data && (
        <div className="flex flex-col gap-4">
          {/* Scope summary + export actions */}
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-800">{data.title}</h3>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {scopeSummary.map((s) => (
                  <span key={s.label}>
                    <span className="font-medium text-slate-600">{s.label}:</span> {s.value}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={data.rows.length === 0}
                className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                title="Downloads a .csv file that opens directly in Excel or Google Sheets"
              >
                <FileSpreadsheet className="h-4 w-4" /> Export to Excel
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={data.rows.length === 0}
                className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                title="Opens a print-formatted view — choose 'Save as PDF' in the print dialog"
              >
                <Printer className="h-4 w-4" /> Export to PDF
              </button>
            </div>
          </div>

          {/* Generic preview table */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {!loading && <Pagination page={page} pageSize={REPORTS_PAGE_SIZE} total={sortedRows.length} onPageChange={setPage} />}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    {data.columns.map((c) => (
                      <SortableTh
                        key={c.key}
                        label={c.label}
                        sortKey={c.key}
                        activeKey={sort.key}
                        dir={sort.dir}
                        onClick={handleSort}
                        align={c.type === "number" ? "right" : "left"}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRows.map((row, i) => (
                    <tr key={i}>
                      {data.columns.map((c) => (
                        <td key={c.key} className={`px-4 py-3 text-slate-600 ${c.type === "number" ? "text-right" : ""}`}>
                          {formatCellValue(row[c.key], c.key, c.type)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {sortedRows.length === 0 && (
                    <tr>
                      <td colSpan={data.columns.length} className="px-4 py-8 text-center text-slate-500">
                        No data in this scope.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {loading && !data && <div className="py-12 text-center text-slate-500">Loading report...</div>}
    </div>
  );
}
