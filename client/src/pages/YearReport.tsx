import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Lock, Printer } from "lucide-react";
import { api } from "../api/client";
import type { RockStatus, YearReportData, YearReportPeriod, YearReportRockSummary } from "../api/types";
import { formatCurrency, formatCurrencyShort, formatPct, formatProgressPct } from "../utils/format";
import StreamBreakdownCard from "../components/StreamBreakdownCard";
import { STREAM_CATEGORIES } from "../utils/streams";

// The frozen full-year report generated when a Year is wrapped up
// (server/src/utils/yearReport.ts). Read-only by nature — it's a snapshot,
// so it reads the same no matter what changes afterwards. "Print / Save as
// PDF" uses the browser's print dialog (the app chrome is hidden in print),
// and the two CSV exports carry the full detail, including each Company's
// quarter-by-quarter figures, which are too wide to print.

const STATUS_LABELS: Record<RockStatus, string> = {
  PENDING: "Pending",
  ON_TRACK: "On Track",
  AT_RISK: "At Risk",
  TARGET_MET: "Target Met",
  ROLLED_OVER: "Rolled Over",
};

const card = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm break-inside-avoid";
const th = "px-3 py-2 text-right font-semibold";
const thL = "px-3 py-2 text-left font-semibold";
const td = "px-3 py-2 text-right tabular-nums";
const tdL = "px-3 py-2 text-left";

function Money({ v }: { v: number }) {
  return (
    <span title={formatCurrency(v)} className={v < 0 ? "text-red-600 dark:text-red-400" : undefined}>
      {formatCurrencyShort(v)}
    </span>
  );
}

function csvEscape(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const PERIOD_HEADERS = [
  "Revenue Target",
  "Revenue Actual",
  "Revenue Attainment %",
  "Collections Target",
  "Collections Actual",
  "Collections Attainment %",
  "Expenses Target",
  "Expenses Actual",
  "Expenses Attainment %",
  "Net Income Target",
  "Net Income Actual",
  "Disbursements",
];
function periodCells(p: YearReportPeriod): number[] {
  return [
    p.revenueTarget,
    p.revenueActual,
    p.revenueAttainmentPct,
    p.collectionsTarget,
    p.collectionsActual,
    p.collectionsAttainmentPct,
    p.expensesTarget,
    p.expensesActual,
    p.expensesAttainmentPct,
    p.netIncomeTarget,
    p.netIncomeActual,
    p.disbursementsActual,
  ];
}

function exportFinancials(r: YearReportData) {
  const rows: (string | number)[][] = [["Business Unit", "Company", "Period", ...PERIOD_HEADERS]];
  for (const bu of r.businessUnits) {
    for (const c of bu.companies) {
      c.quarters.forEach((q, i) => rows.push([bu.businessUnitName, c.companyName, `Q${i + 1}`, ...periodCells(q)]));
      rows.push([bu.businessUnitName, c.companyName, "Year", ...periodCells(c.annual)]);
    }
    rows.push([bu.businessUnitName, "(Business Unit total)", "Year", ...periodCells(bu.annual)]);
  }
  r.quarters.forEach((q, i) => rows.push(["(Group total)", "", `Q${i + 1}`, ...periodCells(q)]));
  rows.push(["(Group total)", "", "Year", ...periodCells(r.annual)]);
  download(`year-${r.year}-wrap-up-financials.csv`, rows);
}

function exportRocks(r: YearReportData) {
  const rows: (string | number)[][] = [["Business Unit", "Company", "Quarter", "Rock", "Business Goal", "Owner", "Status", "Progress %", "Remarks"]];
  for (const x of r.rocks.items) {
    rows.push([x.businessUnitName, x.companyName, `Q${x.quarter}`, x.title, x.businessGoalName, x.ownerName, STATUS_LABELS[x.status] || x.status, x.progressPct, x.remarks]);
  }
  download(`year-${r.year}-wrap-up-rocks.csv`, rows);
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className={`${card} p-4`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        {note && <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function FinancialTable({ rows, firstHeader }: { rows: { label: string; p: YearReportPeriod; strong?: boolean }[]; firstHeader: string }) {
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full min-w-[900px] text-sm">
        <thead className="border-b border-slate-200 dark:border-slate-700 text-xs uppercase text-slate-500 dark:text-slate-400">
          <tr>
            <th className={thL}>{firstHeader}</th>
            <th className={th}>Revenue T / A</th>
            <th className={th}>Rev %</th>
            <th className={th}>Collections T / A</th>
            <th className={th}>Coll %</th>
            <th className={th}>Expenses T / A</th>
            <th className={th}>Exp %</th>
            <th className={th}>Net Income T / A</th>
            <th className={th}>Disbursements</th>
          </tr>
        </thead>
        <tbody className="text-slate-700 dark:text-slate-200">
          {rows.map(({ label, p, strong }) => (
            <tr key={label} className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${strong ? "bg-slate-50 dark:bg-slate-800/60 font-semibold" : ""}`}>
              <td className={tdL}>{label}</td>
              <td className={td}>
                <Money v={p.revenueTarget} /> / <Money v={p.revenueActual} />
              </td>
              <td className={td}>{formatPct(p.revenueAttainmentPct)}</td>
              <td className={td}>
                <Money v={p.collectionsTarget} /> / <Money v={p.collectionsActual} />
              </td>
              <td className={td}>{formatPct(p.collectionsAttainmentPct)}</td>
              <td className={td}>
                <Money v={p.expensesTarget} /> / <Money v={p.expensesActual} />
              </td>
              <td className={td}>{formatPct(p.expensesAttainmentPct)}</td>
              <td className={td}>
                <Money v={p.netIncomeTarget} /> / <Money v={p.netIncomeActual} />
              </td>
              <td className={td}>
                <Money v={p.disbursementsActual} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RockSummaryTable({ rows, firstHeader }: { rows: { label: string; s: YearReportRockSummary; strong?: boolean }[]; firstHeader: string }) {
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-slate-200 dark:border-slate-700 text-xs uppercase text-slate-500 dark:text-slate-400">
          <tr>
            <th className={thL}>{firstHeader}</th>
            <th className={th}>Rocks</th>
            <th className={th}>Target Met</th>
            <th className={th}>On Track</th>
            <th className={th}>At Risk</th>
            <th className={th}>Pending</th>
            <th className={th}>Rolled Over</th>
            <th className={th}>Completion</th>
            <th className={th}>Avg Progress</th>
          </tr>
        </thead>
        <tbody className="text-slate-700 dark:text-slate-200">
          {rows.map(({ label, s, strong }) => (
            <tr key={label} className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${strong ? "bg-slate-50 dark:bg-slate-800/60 font-semibold" : ""}`}>
              <td className={tdL}>{label}</td>
              <td className={td}>{s.total}</td>
              <td className={td}>{s.targetMet}</td>
              <td className={td}>{s.onTrack}</td>
              <td className={td}>{s.atRisk}</td>
              <td className={td}>{s.pending}</td>
              <td className={td}>{s.rolledOver}</td>
              <td className={td}>{formatPct(s.completionPct)}</td>
              <td className={td}>{s.avgProgressPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function YearReport() {
  const { id } = useParams();
  const [report, setReport] = useState<YearReportData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api
      .yearWrapUpReport(id)
      .then(setReport)
      .catch((err) => setError(err.message || "Failed to load the report"));
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
        {error}
        <Link to="/years" className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
          Back to Years
        </Link>
      </div>
    );
  }
  if (!report) return <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Loading report...</div>;

  const a = report.annual;
  const rs = report.rocks.summary;
  const generated = new Date(report.generatedAt).toLocaleString();

  return (
    <div className="year-report mx-auto flex max-w-7xl flex-col gap-8">
      {/* Printing: force black-on-white even in dark mode, and let wide
          tables use the full page width. */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          .year-report, .year-report * { color: #0f172a !important; background: transparent !important; border-color: #cbd5e1 !important; box-shadow: none !important; }
          .year-report .overflow-x-auto { overflow: visible !important; }
          .year-report table { min-width: 0 !important; font-size: 10px; }
        }
      `}</style>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/years" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline print:hidden">
            <ArrowLeft className="h-3.5 w-3.5" /> Years
          </Link>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Year {report.year} — Wrap-up Report</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Lock className="h-3 w-3" /> Generated {generated}
            {report.generatedBy?.name ? ` by ${report.generatedBy.name}` : ""}. A frozen snapshot of the Year at wrap-up.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            onClick={() => exportFinancials(report)}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4" /> Financials CSV
          </button>
          <button
            onClick={() => exportRocks(report)}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4" /> Rocks CSV
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
        </div>
      </div>

      <Section title="Year at a glance">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <Kpi label="Revenue" value={<Money v={a.revenueActual} />} sub={`${formatPct(a.revenueAttainmentPct)} of ${formatCurrencyShort(a.revenueTarget)} target`} />
          <Kpi label="Collections" value={<Money v={a.collectionsActual} />} sub={`${formatPct(a.collectionsAttainmentPct)} of ${formatCurrencyShort(a.collectionsTarget)} target`} />
          <Kpi label="Expenses" value={<Money v={a.expensesActual} />} sub={`${formatPct(a.expensesAttainmentPct)} of ${formatCurrencyShort(a.expensesTarget)} budget`} />
          <Kpi label="Net Income" value={<Money v={a.netIncomeActual} />} sub={`vs ${formatCurrencyShort(a.netIncomeTarget)} target · before tax`} />
          <Kpi label="Disbursements" value={<Money v={a.disbursementsActual} />} />
          <Kpi label="Rocks Met" value={`${rs.targetMet} / ${rs.total}`} sub={`${formatPct(rs.completionPct)} completion · ${rs.rolledOver} rolled over`} />
        </div>
      </Section>

      <Section title="Financials by Quarter" note="T / A = Target / Actual. Net Income is Revenue − Expenses, before tax.">
        <FinancialTable
          firstHeader="Quarter"
          rows={[...report.quarters.map((p, i) => ({ label: `Q${i + 1}`, p })), { label: `Year ${report.year}`, p: a, strong: true }]}
        />
      </Section>

      <Section title="Financials by Business Unit">
        <FinancialTable
          firstHeader="Business Unit"
          rows={[...report.businessUnits.map((b) => ({ label: b.businessUnitName, p: b.annual })), { label: "All Business Units", p: a, strong: true }]}
        />
      </Section>

      <Section title="Financials by Company" note="Full-year figures. Each Company's quarter-by-quarter figures are in the Financials CSV.">
        {report.businessUnits.map((b) => (
          <div key={b.businessUnitId} className="flex flex-col gap-2">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{b.businessUnitName}</div>
            <FinancialTable
              firstHeader="Company"
              rows={[...b.companies.map((c) => ({ label: c.companyName, p: c.annual })), { label: `${b.businessUnitName} total`, p: b.annual, strong: true }]}
            />
          </div>
        ))}
      </Section>

      {report.streams && report.streams.some((b) => b.lines.length > 1) && (
        <Section title="Financial Streams" note="Full-year totals split into the original figures and each labeled stream.">
          {STREAM_CATEGORIES.map((c) => (
            <StreamBreakdownCard key={c} breakdown={report.streams} category={c} />
          ))}
        </Section>
      )}

      <Section
        title="Rocks"
        note="A Rock carried forward within the Year counts once (its latest version). Rolled Over means it slipped into the next quarter or the next Year."
      >
        <RockSummaryTable
          firstHeader="Quarter"
          rows={[...report.rocks.byQuarter.map((s, i) => ({ label: `Q${i + 1}`, s })), { label: `Year ${report.year}`, s: rs, strong: true }]}
        />
        <RockSummaryTable firstHeader="Business Unit" rows={report.rocks.byBusinessUnit.map((b) => ({ label: b.businessUnitName, s: b }))} />
        <RockSummaryTable firstHeader="Business Goal" rows={report.rocks.byGoal.map((g) => ({ label: g.businessGoalName, s: g }))} />
      </Section>

      <Section title={`All Rocks (${report.rocks.items.length})`} note="Every Rock as it stood at wrap-up, including originals that were rolled over.">
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-700 text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className={thL}>Business Unit</th>
                <th className={thL}>Company</th>
                <th className={thL}>Q</th>
                <th className={thL}>Rock</th>
                <th className={thL}>Business Goal</th>
                <th className={thL}>Owner</th>
                <th className={thL}>Status</th>
                <th className={th}>Progress</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200">
              {report.rocks.items.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 align-top">
                  <td className={tdL}>{r.businessUnitName}</td>
                  <td className={tdL}>{r.companyName}</td>
                  <td className={tdL}>Q{r.quarter}</td>
                  <td className={tdL}>
                    {r.title}
                    {r.remarks && <div className="text-xs italic text-slate-500 dark:text-slate-400">{r.remarks}</div>}
                  </td>
                  <td className={tdL}>{r.businessGoalName || "—"}</td>
                  <td className={tdL}>{r.ownerName || "—"}</td>
                  <td className={tdL}>{STATUS_LABELS[r.status] || r.status}</td>
                  <td className={td}>{formatProgressPct(r.progressPct)}</td>
                </tr>
              ))}
              {report.rocks.items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                    No Rocks were recorded for {report.year}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
