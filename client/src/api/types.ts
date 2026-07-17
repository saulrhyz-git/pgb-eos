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
  annualTarget: number;
  quarterTarget: number;
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
  companyId: string;
  companyName: string;
  businessUnitId: string;
  businessUnitName: string;
  annualTarget: { revenueInternal: number; revenueExternal: number; total: number };
  quarterTargets: { quarter: number; revenueInternal: number; revenueExternal: number; total: number }[];
  distributedTotal: number;
  varianceFromAnnual: number;
}

export interface OperationalGridRow {
  companyId: string;
  companyName: string;
  businessUnitId: string;
  businessUnitName: string;
  annualTarget: number;
  quarterTarget: number;
  quarterActual: {
    internal: number;
    external: number;
    total: number;
    collectionsInternal: number;
    collectionsExternal: number;
    expensesInternal: number;
    expensesExternal: number;
  };
  quarterAttainmentPct: number;
  ytdActual: number;
  ytdVsAnnualPct: number;
  remarks: string;
}

export interface DashboardResponse {
  scope: { yearId: string; quarter: number; businessUnitId: string | null; companyId: string | null };
  kpis: Kpis;
  chart: ChartPoint[];
  targetMatrix: TargetMatrixRow[];
  operationalGrid: OperationalGridRow[];
}
