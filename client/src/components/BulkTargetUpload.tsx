import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import * as ExcelJS from "exceljs";
import { AlertTriangle, CheckCircle2, Download, Upload, X } from "lucide-react";
import { api } from "../api/client";
import type { Figures } from "../api/types";

// Bulk CSV/Excel upload for Quarter Targets. The file (.csv/.xlsx/.xls) is
// parsed entirely in the browser via SheetJS ("xlsx" package) — no file
// upload endpoint needed, the resulting rows are posted as plain JSON to
// POST /targets/quarter/bulk (see server/src/routes/targets.ts). One file
// can cover any mix of Companies and Quarters (even all 4 quarters for
// several Companies at once), since each row carries its own Quarter.
//
// The downloadable template is built with "exceljs" instead of "xlsx":
// SheetJS's free Community Edition can only *read* Excel data validation
// (dropdown lists), it silently drops them on write, so it can't produce a
// template with real in-cell dropdowns. ExcelJS can write them, so the
// Business Unit/Company/Quarter columns get real dropdown lists sourced
// from whatever Business Units/Companies currently exist — no more losing
// an upload to a misspelled or mis-spaced name. Parsing an uploaded file
// still uses "xlsx" (SheetJS), which reads plain cell values just fine
// regardless of which library wrote them.

const FIGURE_FIELDS: { key: keyof Figures; label: string }[] = [
  { key: "revenueInternal", label: "Revenue - Internal" },
  { key: "revenueExternal", label: "Revenue - External" },
  { key: "collectionsInternalEarned", label: "Collections Internal - Earned" },
  { key: "collectionsInternalUnearned", label: "Collections Internal - Unearned" },
  { key: "collectionsInternalOthers", label: "Collections Internal - Others" },
  { key: "collectionsExternalEarned", label: "Collections External - Earned" },
  { key: "collectionsExternalUnearned", label: "Collections External - Unearned" },
  { key: "collectionsExternalOthers", label: "Collections External - Others" },
  { key: "expensesInterest", label: "Expenses - Interest" },
  { key: "expensesDepreciation", label: "Expenses - Depreciation" },
  { key: "expensesOtherNonCash", label: "Expenses - Other Non-Cash" },
];

// Strips everything but letters/digits and lowercases — lets "Revenue -
// Internal", "revenue_internal", "Revenue Internal", and "revenueInternal"
// all resolve to the same canonical field without a giant alias list.
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type CanonicalField = "businessUnitName" | "companyName" | "quarter" | keyof Figures;

const HEADER_MAP: Record<string, CanonicalField> = {
  businessunit: "businessUnitName",
  company: "companyName",
  companyname: "companyName",
  quarter: "quarter",
  q: "quarter",
  // A couple of shorthand aliases in addition to the label/key-derived ones added below.
  expensesother: "expensesOtherNonCash",
  expensesothernoncashexpenses: "expensesOtherNonCash",
};
for (const f of FIGURE_FIELDS) {
  HEADER_MAP[normalizeHeader(f.label)] = f.key;
  HEADER_MAP[normalizeHeader(f.key)] = f.key;
}

interface ParsedRow {
  sourceRow: number;
  businessUnitName?: string;
  companyName: string;
  quarter: number | null;
  figures: Partial<Figures>;
  clientError?: string;
  // Filled in after the server responds.
  status?: "ok" | "error";
  serverError?: string;
}

function parseWorkbook(data: ArrayBuffer): { rows: ParsedRow[]; unmatchedHeaders: string[] } {
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });

  const headerKeys = raw.length ? Object.keys(raw[0]) : [];
  const fieldByHeader = new Map<string, CanonicalField>();
  const unmatchedHeaders: string[] = [];
  for (const h of headerKeys) {
    const field = HEADER_MAP[normalizeHeader(h)];
    if (field) fieldByHeader.set(h, field);
    else unmatchedHeaders.push(h);
  }

  const rows: ParsedRow[] = raw.map((record, i) => {
    let businessUnitName: string | undefined;
    let companyName = "";
    let quarterRaw = "";
    const figures: Partial<Figures> = {};

    for (const [header, value] of Object.entries(record)) {
      const field = fieldByHeader.get(header);
      if (!field) continue;
      if (field === "businessUnitName") businessUnitName = String(value ?? "").trim() || undefined;
      else if (field === "companyName") companyName = String(value ?? "").trim();
      else if (field === "quarter") quarterRaw = String(value ?? "").trim();
      else figures[field] = Number(value) || 0;
    }

    const quarterNum = Number(quarterRaw);
    const quarter = Number.isInteger(quarterNum) && quarterNum >= 1 && quarterNum <= 4 ? quarterNum : null;

    let clientError: string | undefined;
    if (!companyName) clientError = "Missing Company";
    else if (!quarter) clientError = `Invalid Quarter ("${quarterRaw}") — must be 1, 2, 3, or 4`;

    return { sourceRow: i + 1, businessUnitName, companyName, quarter, figures, clientError };
  });

  return { rows, unmatchedHeaders };
}

// How many data rows the Business Unit/Company/Quarter dropdown validation
// is applied to — generous enough for any realistic bulk upload without
// applying it to the whole 1M-row sheet (which would bloat the file and
// slow Excel down for no benefit).
const TEMPLATE_DROPDOWN_ROWS = 500;

async function downloadTemplate(businessUnitNames: string[], companyNames: string[]) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Targets");
  const listSheet = wb.addWorksheet("Lists");
  listSheet.state = "hidden"; // reference data only, not meant to be edited directly

  const header = ["Business Unit", "Company", "Quarter", ...FIGURE_FIELDS.map((f) => f.label)];
  sheet.columns = header.map((h) => ({ header: h, width: Math.max(14, h.length + 2) }));

  // A couple of real example rows (using the first actual Business Unit/
  // Company if any exist yet) so the template isn't just a bare header.
  const exampleBU = businessUnitNames[0] ?? "";
  const exampleCompany = companyNames[0] ?? "";
  if (exampleCompany) {
    sheet.addRow([exampleBU, exampleCompany, 1, ...FIGURE_FIELDS.map(() => 0)]);
    sheet.addRow([exampleBU, exampleCompany, 2, ...FIGURE_FIELDS.map(() => 0)]);
  }

  // Lists sheet backs the dropdowns — column A is every current Business
  // Unit name, column B every current Company name (flat, not filtered per
  // Business Unit — Company names only need to be unique *within* a
  // Business Unit, so the same Company name could legitimately appear under
  // two different Business Units; the upload's Business Unit column is what
  // disambiguates that case server-side, same as typing it by hand).
  listSheet.getColumn(1).values = ["Business Unit", ...businessUnitNames];
  listSheet.getColumn(2).values = ["Company", ...companyNames];

  const dvErrorOptions = { showErrorMessage: true, errorStyle: "warning" as const };
  for (let r = 2; r <= TEMPLATE_DROPDOWN_ROWS + 1; r++) {
    if (businessUnitNames.length) {
      sheet.getCell(r, 1).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`Lists!$A$2:$A$${businessUnitNames.length + 1}`],
        ...dvErrorOptions,
        errorTitle: "Unrecognized Business Unit",
        error: "Pick a Business Unit from the dropdown, or leave this blank if the Company name alone is unambiguous.",
      };
    }
    if (companyNames.length) {
      sheet.getCell(r, 2).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`Lists!$B$2:$B$${companyNames.length + 1}`],
        ...dvErrorOptions,
        errorTitle: "Unrecognized Company",
        error: "Pick a Company from the dropdown.",
      };
    }
    sheet.getCell(r, 3).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"1,2,3,4"'],
      ...dvErrorOptions,
      errorTitle: "Invalid Quarter",
      error: "Quarter must be 1, 2, 3, or 4.",
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "target_upload_template.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  yearId: string;
  yearLabel: string;
  onClose: () => void;
  onUploaded: () => void;
}

export default function BulkTargetUpload({ yearId, yearLabel, onClose, onUploaded }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [unmatchedHeaders, setUnmatchedHeaders] = useState<string[]>([]);
  const [parseError, setParseError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<{ successCount: number; errorCount: number } | null>(null);

  // Every currently-accessible Business Unit/Company name — loaded once on
  // open, used only to populate the template's dropdown lists (not to
  // validate the parsed upload itself, since the server is the real source
  // of truth there). `null` while loading; the Download Template button
  // stays disabled until this resolves so it never ships a stale/empty list.
  const [names, setNames] = useState<{ businessUnits: string[]; companies: string[] } | null>(null);
  const [templateBusy, setTemplateBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.businessUnits(), api.companies()])
      .then(([bus, companies]) => {
        setNames({
          businessUnits: bus.map((b) => b.name),
          companies: companies.map((c) => c.name),
        });
      })
      .catch(() => setNames({ businessUnits: [], companies: [] }));
  }, []);

  async function handleDownloadTemplate() {
    if (!names) return;
    setTemplateBusy(true);
    try {
      await downloadTemplate(names.businessUnits, names.companies);
    } finally {
      setTemplateBusy(false);
    }
  }

  const validRows = rows.filter((r) => !r.clientError);
  const invalidRows = rows.filter((r) => r.clientError);

  async function handleFile(file: File) {
    setParseError("");
    setSummary(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const { rows: parsed, unmatchedHeaders: unmatched } = parseWorkbook(buf);
      if (parsed.length === 0) {
        setRows([]);
        setParseError("No data rows found in this file.");
        return;
      }
      setRows(parsed);
      setUnmatchedHeaders(unmatched);
    } catch (err: any) {
      setRows([]);
      setParseError(err.message || "Could not read this file — is it a valid .csv/.xlsx/.xls?");
    }
  }

  async function handleSubmit() {
    if (validRows.length === 0) return;
    setSubmitting(true);
    setParseError("");
    try {
      const result = await api.bulkUploadQuarterTargets({
        yearId,
        rows: validRows.map((r) => ({
          sourceRow: r.sourceRow,
          businessUnitName: r.businessUnitName,
          companyName: r.companyName,
          quarter: r.quarter!,
          ...r.figures,
        })),
      });
      const byRow = new Map(result.results.map((r) => [r.row, r]));
      setRows((prev) =>
        prev.map((r) => {
          const match = byRow.get(r.sourceRow);
          if (!match) return r;
          return { ...r, status: match.status, serverError: match.error };
        })
      );
      setSummary({ successCount: result.successCount, errorCount: result.errorCount });
      if (result.successCount > 0) onUploaded();
    } catch (err: any) {
      setParseError(err.message || "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-4xl flex-col gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Bulk Upload Targets — {yearLabel}</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Upload a CSV or Excel file to set Quarter Targets for many Companies (and Quarters) at once. Each row
              needs a Company and a Quarter (1-4); include a Business Unit column too if a Company name is used in
              more than one Business Unit. Blank figure cells are treated as 0. The downloaded template's Business
              Unit, Company, and Quarter columns come with dropdown lists of current values, so typos and spacing
              mistakes shouldn't slip through — just click a cell's arrow to pick instead of typing.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!names || templateBusy}
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> {templateBusy ? "Preparing..." : "Download Template"}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            <Upload className="h-4 w-4" /> Choose File
          </button>
          {fileName && <span className="text-xs text-slate-500 dark:text-slate-400">{fileName}</span>}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>

        {parseError && (
          <div className="flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {parseError}
          </div>
        )}

        {unmatchedHeaders.length > 0 && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Ignored {unmatchedHeaders.length} unrecognized column{unmatchedHeaders.length === 1 ? "" : "s"}:{" "}
            {unmatchedHeaders.join(", ")}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span>{rows.length} row(s) parsed</span>
              <span className="text-emerald-600 dark:text-emerald-400">{validRows.length} ready to upload</span>
              {invalidRows.length > 0 && <span className="text-red-600 dark:text-red-400">{invalidRows.length} skipped (errors below)</span>}
            </div>

            <div className="max-h-72 overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium text-slate-500 dark:text-slate-400">Row</th>
                    <th className="px-2 py-1.5 text-left font-medium text-slate-500 dark:text-slate-400">Business Unit</th>
                    <th className="px-2 py-1.5 text-left font-medium text-slate-500 dark:text-slate-400">Company</th>
                    <th className="px-2 py-1.5 text-left font-medium text-slate-500 dark:text-slate-400">Quarter</th>
                    <th className="px-2 py-1.5 text-left font-medium text-slate-500 dark:text-slate-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((r) => (
                    <tr key={r.sourceRow}>
                      <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">{r.sourceRow}</td>
                      <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{r.businessUnitName || "—"}</td>
                      <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{r.companyName || "—"}</td>
                      <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{r.quarter ? `Q${r.quarter}` : "—"}</td>
                      <td className="px-2 py-1.5">
                        {r.status === "ok" ? (
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                          </span>
                        ) : r.status === "error" ? (
                          <span className="text-red-600 dark:text-red-400">{r.serverError}</span>
                        ) : r.clientError ? (
                          <span className="text-red-600 dark:text-red-400">{r.clientError}</span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {summary && (
          <div
            className={`rounded-md px-3 py-2 text-sm ${
              summary.errorCount === 0
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
            }`}
          >
            {summary.successCount} row(s) saved{summary.errorCount > 0 ? `, ${summary.errorCount} failed — see Status column above` : "."}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {summary ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={validRows.length === 0 || submitting}
            onClick={handleSubmit}
            className="flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {submitting ? "Uploading..." : `Upload ${validRows.length} Row(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
