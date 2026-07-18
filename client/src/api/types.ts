export type Role = "SUPERADMIN" | "GROUP_INTEGRATOR" | "BU_INTEGRATOR";

export interface AuthUser {
  id: string;
  email: string;
  username?: string | null;
  name: string;
  role: Role;
  businessUnitIds: string[];
  mustChangePassword: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  createdAt: string;
  businessUnits: { id: string; name: string }[];
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
  quarterTargets: { quarter: number; revenueInternal: number; revenueExternal: number; total: number }[];
  // Always exactly the sum of quarterTargets' totals — Annual Target is no
  // longer a separately-entered figure.
  annualTarget: number;
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

export type RockStatus = "PENDING" | "ON_TRACK" | "AT_RISK" | "TARGET_MET";

export interface BusinessGoal {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  // Empty = global (usable anywhere). Non-empty = scoped to just these BUs.
  businessUnits: { id: string; name: string }[];
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
