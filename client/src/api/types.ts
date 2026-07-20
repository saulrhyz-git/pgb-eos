export type Role = "SUPERADMIN" | "GROUP_INTEGRATOR" | "BU_INTEGRATOR";

// The gate-able areas of the app a Custom Role's permission matrix can grant
// View/Edit/Delete over, independently, per Business Unit or Company.
// SCORECARD gates the Executive Scorecard page itself; only its View flag is
// meaningful (there's nothing to edit/delete on a read-only summary page).
// AUDIT_LOG likewise only has a meaningful View flag, and (unlike every other
// resource here) isn't really about any one Business Unit/Company's data —
// see permissions.ts on the backend for why it's excluded from
// visibility-filtering logic despite still being requested through the same
// per-BU/Company matrix UI.
export type Resource =
  | "TARGETS"
  | "REVENUE"
  | "COLLECTIONS"
  | "EXPENSES"
  | "ROCKS"
  | "SCORECARD"
  | "AUDIT_LOG"
  | "REPORTS"
  | "DISBURSEMENTS"
  | "COMPARISON";

export interface AuthUser {
  id: string;
  email: string;
  username?: string | null;
  name: string;
  // null = "blank" role — no base-role-derived access; relies entirely on
  // an assigned Custom Role.
  role: Role | null;
  // Superadmin-authored note (title, team, etc.), shown in the app header
  // in place of the role label. Not editable by the user themselves.
  description: string;
  businessUnitIds: string[];
  mustChangePassword: boolean;
  // Any number of Custom Roles assigned (see UserCustomRole in
  // schema.prisma) — effective access is the union of all of them.
  customRoleIds: string[];
}

export interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: Role | null;
  description: string;
  mustChangePassword: boolean;
  createdAt: string;
  businessUnits: { id: string; name: string }[];
  customRoles: { id: string; name: string }[];
}

// One row of a Custom Role's permission matrix: for one Business Unit (or,
// if companyId is set, one specific Company within it) and one resource,
// what's allowed. A Company-level row takes precedence over a
// Business-Unit-level row for the same resource when both exist.
export interface RolePermission {
  id?: string;
  businessUnitId: string;
  businessUnitName?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  resource: Resource;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface CustomRole {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  permissions: RolePermission[];
}

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  fromAddress: string;
  fromName: string | null;
  updatedAt: string;
}

export interface Year {
  id: string;
  year: number;
}

// A manual, admin-controlled lock on one Quarter of a Year's Targets (Group
// Integrator/Superadmin only) — applies to every Company at once. Layered
// on top of the automatic calendar-based lock; presence of an entry means
// that quarter is locked regardless of the real calendar date.
export interface TargetLockEntry {
  quarter: number;
  lockedAt: string;
  lockedById: string | null;
  lockedByName: string | null;
}

export interface BusinessUnit {
  id: string;
  name: string;
  companies?: { id: string; name: string }[];
}

export interface Company {
  id: string;
  name: string;
  description: string;
  businessUnitId: string;
}

export interface Figures {
  revenueInternal: number;
  revenueExternal: number;
  collectionsInternal: number;
  collectionsExternal: number;
  expensesInternal: number;
  expensesExternal: number;
}

export interface Kpis {
  // Annual Target is not separately entered — it's always the sum of every
  // in-scope Company's Q1-Q4 Quarter Target, split by category, so these
  // never change with the quarter filter.
  annualRevenueTarget: number;
  annualCollectionsTarget: number;
  annualExpensesTarget: number;
  // Selected-period (or "All Quarters") target by category — these DO
  // change with the quarter filter, unlike the annual figures above.
  quarterTarget: number;
  quarterCollectionsTarget: number;
  quarterExpensesTarget: number;
  quarterActual: number;
  ytdTarget: number;
  ytdActual: number;
  attainmentPct: number;
  ytdAttainmentPct: number;
  // Disbursements: recorded (not targeted), so — unlike the pairs above —
  // each of these is just one running actual total for the selected period
  // (respects the Quarter filter, same "All Quarters = sum of Q1-Q4" rule).
  quarterAdvancesActual: number;
  quarterLoansActual: number;
  quarterInterestsActual: number;
}

export interface ChartPoint {
  quarter: number;
  label: string;
  targetInternal: number;
  targetExternal: number;
  targetTotal: number;
  actualInternal: number;
  actualExternal: number;
  actualTotal: number;
}

export interface TargetMatrixRow {
  businessUnitId: string;
  businessUnitName: string;
  quarterTargets: { quarter: number; revenue: number; collections: number; expenses: number }[];
  // Always exactly the sum of quarterTargets' totals per category — Annual
  // Target is no longer a separately-entered figure.
  annualTarget: { revenue: number; collections: number; expenses: number };
}

// A single Company's recognized actuals within its Business Unit.
export interface OperationalGridCompanyRow {
  companyId: string;
  companyName: string;
  quarterActual: {
    internal: number;
    external: number;
    total: number;
    collectionsInternal: number;
    collectionsExternal: number;
    expensesInternal: number;
    expensesExternal: number;
  };
  ytdActual: number;
  revenueRemarks: string;
  collectionsRemarks: string;
  expensesRemarks: string;
}

// A Business Unit's target (the sum of its Companies' own targets) vs its
// Companies' combined actuals, with each contributing Company broken out
// underneath.
export interface OperationalGridRow {
  businessUnitId: string;
  businessUnitName: string;
  annualTarget: number;
  quarterTarget: number;
  quarterActual: number;
  quarterAttainmentPct: number;
  ytdActual: number;
  ytdVsAnnualPct: number;
  companies: OperationalGridCompanyRow[];
}

export interface DashboardResponse {
  scope: { yearId: string; quarter: number; allQuarters: boolean; businessUnitId: string | null; companyId: string | null };
  kpis: Kpis;
  chart: ChartPoint[];
  targetMatrix: TargetMatrixRow[];
  operationalGrid: OperationalGridRow[];
}

// Generic shape shared by every report type the Reports engine can produce —
// see server/src/routes/reports.ts. Because every report (Financial
// Performance, Rocks, Executive Summary, and any future one) resolves to the
// same { columns, rows } contract, the whole Reports page can render and
// export ANY of them with one generic table + CSV/print renderer instead of
// bespoke UI per report.
export interface ReportColumn {
  key: string;
  label: string;
  type: "text" | "number";
}

export interface ReportResult {
  title: string;
  scope: Record<string, string | number | null>;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
}

export type RockStatus = "PENDING" | "ON_TRACK" | "AT_RISK" | "TARGET_MET";

export interface BusinessGoal {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  // Empty = global (usable anywhere). Non-empty = scoped to just these BUs.
  businessUnits: { id: string; name: string }[];
}

// ---------- Executive Scorecard ----------
// A condensed, BU-level-only (no Company drill-down) re-shaping of the same
// Revenue dashboard + Rocks data, aimed at a C-Level/BOD audience.
export interface ScorecardChartPoint {
  quarter: number;
  label: string;
  targetTotal: number;
  actualTotal: number;
}

export interface ScorecardRevenueBuRow {
  businessUnitId: string;
  businessUnitName: string;
  annualTarget: number;
  quarterTarget: number;
  quarterActual: number;
  quarterAttainmentPct: number;
  ytdActual: number;
  ytdVsAnnualPct: number;
}

export interface ScorecardRevenue {
  kpis: {
    annualRevenueTarget: number;
    annualCollectionsTarget: number;
    annualExpensesTarget: number;
    quarterTarget: number;
    quarterCollectionsTarget: number;
    quarterExpensesTarget: number;
    quarterActual: number;
    ytdTarget: number;
    ytdActual: number;
    attainmentPct: number;
    ytdAttainmentPct: number;
  };
  chart: ScorecardChartPoint[];
  businessUnits: ScorecardRevenueBuRow[];
}

export interface ScorecardRocksSummary {
  total: number;
  targetMet: number;
  onTrack: number;
  atRisk: number;
  pending: number;
  avgProgressPct: number;
}

export interface ScorecardRocksBuRow extends ScorecardRocksSummary {
  businessUnitId: string;
  businessUnitName: string;
}

export interface ScorecardAttentionRock {
  id: string;
  title: string;
  companyName: string;
  businessUnitName: string;
  ownerName: string;
  status: RockStatus;
  progressPct: number;
  quarter: number;
}

export interface ScorecardRocks {
  summary: ScorecardRocksSummary;
  businessUnits: ScorecardRocksBuRow[];
  attentionNeeded: ScorecardAttentionRock[];
}

export interface ScorecardDisbursementsSummary {
  advancesActual: number;
  loansActual: number;
  interestsActual: number;
}

export interface ScorecardDisbursementsBuRow extends ScorecardDisbursementsSummary {
  businessUnitId: string;
  businessUnitName: string;
}

export interface ScorecardDisbursements {
  summary: ScorecardDisbursementsSummary;
  businessUnits: ScorecardDisbursementsBuRow[];
}

export interface ScorecardResponse {
  scope: { yearId: string; quarter: number; allQuarters: boolean; businessUnitId: string | null };
  revenue: ScorecardRevenue;
  rocks: ScorecardRocks;
  disbursements: ScorecardDisbursements;
}

// ---------- Disbursements ----------
// Recorded — not targeted — per Company/Year/Quarter, same hierarchy as
// Quarter Actuals but with no corresponding Target. All three sub-categories
// (Advances/Loans/Interests) live on one row per Company/Year/Quarter, each
// split Internal/External with its own Remarks — see
// server/src/routes/disbursements.ts.
export type DisbursementCategory = "ADVANCES" | "LOANS" | "INTERESTS";

export interface DisbursementActual {
  id: string;
  companyId: string;
  yearId: string;
  quarter: number;
  advancesInternal: number;
  advancesExternal: number;
  loansInternal: number;
  loansExternal: number;
  interestsInternal: number;
  interestsExternal: number;
  advancesRemarks: string;
  loansRemarks: string;
  interestsRemarks: string;
  updatedAt: string;
  company: { id: string; name: string; businessUnitId: string };
}

export interface Rock {
  id: string;
  companyId: string;
  yearId: string;
  quarter: number;
  businessGoalId: string | null;
  title: string;
  description: string;
  remarks: string;
  ownerName: string;
  status: RockStatus;
  progressPct: number;
  createdAt: string;
  updatedAt: string;
  company: { id: string; name: string; businessUnitId: string };
  businessGoal: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  updatedBy: { id: string; name: string } | null;
}

// ---------- Comparison ----------
// Side-by-side scope comparison: each panel independently picks a Year,
// Quarter, Business Unit, and Company, and fetches its own snapshot of
// "everything" on the Executive Scorecard (Revenue/Collections/Expenses
// Target+Actual+attainment, Rocks status counts, Disbursements actuals) —
// see server/src/routes/comparison.ts. The frontend computes delta/%-change
// between two snapshots itself; the backend just returns each side's raw
// totals, already masked per the caller's Custom Role grants.
export interface ComparisonScope {
  yearId: string;
  year: number;
  quarter: number;
  allQuarters: boolean;
  businessUnitId: string | null;
  businessUnitName: string | null;
  companyId: string | null;
  companyName: string | null;
}

export interface ComparisonSnapshot {
  scope: ComparisonScope;
  revenueTarget: number;
  revenueActual: number;
  revenueAttainmentPct: number;
  collectionsTarget: number;
  collectionsActual: number;
  collectionsAttainmentPct: number;
  expensesTarget: number;
  expensesActual: number;
  expensesAttainmentPct: number;
  rocksTotal: number;
  rocksTargetMet: number;
  rocksOnTrack: number;
  rocksAtRisk: number;
  rocksPending: number;
  rocksAvgProgressPct: number;
  advancesActual: number;
  loansActual: number;
  interestsActual: number;
}

// ---------- Audit Log ----------
// One append-only record of a mutating action taken in the app. userId/
// userName/userEmail are a snapshot at the time of the action (no live FK to
// User), so entries stay readable even after the acting user is deleted.
export interface AuditLogEntry {
  id: string;
  createdAt: string;
  userId: string | null;
  userName: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogMeta {
  actions: string[];
  entityTypes: string[];
}
