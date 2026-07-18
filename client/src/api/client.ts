import type {
  AdminUser,
  AuthUser,
  BusinessGoal,
  BusinessUnit,
  Company,
  CustomRole,
  DashboardResponse,
  Figures,
  Rock,
  RockStatus,
  Role,
  RolePermission,
  SmtpSettings,
  Year,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const TOKEN_KEY = "eos_dashboard_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(body?.error || `Request failed with status ${res.status}`, res.status);
  }
  return body as T;
}

export const api = {
  login: (identifier: string, password: string) =>
    request<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    }),
  me: () => request<{ user: AuthUser }>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ token: string; user: AuthUser }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  years: () => request<Year[]>("/years"),
  createYear: (year: number) => request<Year>("/years", { method: "POST", body: JSON.stringify({ year }) }),
  // The real calendar quarter "right now" per the server clock — yearId is
  // null if that Year hasn't been created yet. Used to default filter bars
  // to the actual current quarter instead of guessing from the year list.
  currentQuarter: () =>
    request<{ year: number; quarter: number; yearId: string | null; start: string; end: string }>("/current-quarter"),

  businessUnits: () => request<BusinessUnit[]>("/business-units"),
  createBusinessUnit: (name: string) =>
    request<BusinessUnit>("/business-units", { method: "POST", body: JSON.stringify({ name }) }),

  companies: (businessUnitId?: string) =>
    request<Company[]>(`/companies${businessUnitId ? `?businessUnitId=${businessUnitId}` : ""}`),
  createCompany: (name: string, businessUnitId: string, description?: string) =>
    request<Company>("/companies", { method: "POST", body: JSON.stringify({ name, businessUnitId, description }) }),

  dashboard: (params: { yearId: string; quarter: number; businessUnitId?: string; companyId?: string }) => {
    // quarter === 0 means "All Quarters" (full year) in the UI.
    const qs = new URLSearchParams({ yearId: params.yearId, quarter: params.quarter === 0 ? "all" : String(params.quarter) });
    if (params.businessUnitId) qs.set("businessUnitId", params.businessUnitId);
    if (params.companyId) qs.set("companyId", params.companyId);
    return request<DashboardResponse>(`/dashboard?${qs.toString()}`);
  },

  // Annual Target is not separately entered anymore — it's always derived
  // (sum of Q1-Q4 Quarter Target) and shown read-only on the Revenue
  // dashboard; there is no annual API to write to.
  quarterTargets: (params: { yearId: string; quarter?: number; businessUnitId?: string; companyId?: string }) => {
    const qs = new URLSearchParams({ yearId: params.yearId });
    if (params.quarter) qs.set("quarter", String(params.quarter));
    if (params.businessUnitId) qs.set("businessUnitId", params.businessUnitId);
    if (params.companyId) qs.set("companyId", params.companyId);
    return request<any[]>(`/targets/quarter?${qs.toString()}`);
  },
  putQuarterTarget: (payload: { companyId: string; yearId: string; quarter: number } & Figures) =>
    request<any>("/targets/quarter", { method: "PUT", body: JSON.stringify(payload) }),

  actuals: (params: { yearId: string; quarter?: number; businessUnitId?: string; companyId?: string }) => {
    const qs = new URLSearchParams({ yearId: params.yearId });
    if (params.quarter) qs.set("quarter", String(params.quarter));
    if (params.businessUnitId) qs.set("businessUnitId", params.businessUnitId);
    if (params.companyId) qs.set("companyId", params.companyId);
    return request<any[]>(`/actuals?${qs.toString()}`);
  },
  putActual: (
    payload: {
      companyId: string;
      yearId: string;
      quarter: number;
      revenueRemarks?: string;
      collectionsRemarks?: string;
      expensesRemarks?: string;
    } & Figures
  ) => request<any>("/actuals", { method: "PUT", body: JSON.stringify(payload) }),

  patchRemarks: (
    companyId: string,
    yearId: string,
    quarter: number,
    payload: Partial<{ revenueRemarks: string; collectionsRemarks: string; expensesRemarks: string }>
  ) =>
    request<any>(`/actuals/${companyId}/${yearId}/${quarter}/remarks`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  // ---------- Superadmin: Users ----------
  adminUsers: () => request<AdminUser[]>("/admin/users"),
  adminCreateUser: (payload: {
    email: string;
    username?: string;
    name: string;
    role: Role;
    password: string;
    businessUnitIds?: string[];
    customRoleId?: string | null;
  }) => request<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateUser: (
    id: string,
    payload: Partial<{
      email: string;
      username: string | null;
      name: string;
      role: Role;
      businessUnitIds: string[];
      password: string;
      customRoleId: string | null;
    }>
  ) => request<AdminUser>(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  adminDeleteUser: (id: string) => request<void>(`/admin/users/${id}`, { method: "DELETE" }),

  // ---------- Superadmin: Business Units ----------
  adminUpdateBusinessUnit: (id: string, name: string) =>
    request<BusinessUnit>(`/admin/business-units/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  adminDeleteBusinessUnit: (id: string) => request<void>(`/admin/business-units/${id}`, { method: "DELETE" }),

  // ---------- Superadmin: Companies ----------
  adminUpdateCompany: (id: string, payload: Partial<{ name: string; businessUnitId: string; description: string }>) =>
    request<Company>(`/admin/companies/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  adminDeleteCompany: (id: string) => request<void>(`/admin/companies/${id}`, { method: "DELETE" }),

  // ---------- Superadmin: SMTP settings ----------
  getSmtpSettings: () => request<SmtpSettings | null>("/settings/smtp"),
  putSmtpSettings: (payload: {
    host: string;
    port: number;
    secure: boolean;
    username?: string | null;
    password?: string;
    fromAddress: string;
    fromName?: string | null;
  }) => request<SmtpSettings>("/settings/smtp", { method: "PUT", body: JSON.stringify(payload) }),
  testSmtpSettings: (to: string) =>
    request<{ ok: true }>("/settings/smtp/test", { method: "POST", body: JSON.stringify({ to }) }),

  // ---------- Custom Roles (Superadmin only) ----------
  // Named permission profiles assignable to Users as an additional,
  // more granular layer on top of their base Role — see server's
  // routes/customRoles.ts and utils/permissions.ts.
  customRoles: () => request<CustomRole[]>("/custom-roles"),
  createCustomRole: (payload: { name: string; description?: string; permissions: RolePermission[] }) =>
    request<CustomRole>("/custom-roles", { method: "POST", body: JSON.stringify(payload) }),
  updateCustomRole: (id: string, payload: { name: string; description?: string; permissions: RolePermission[] }) =>
    request<CustomRole>(`/custom-roles/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteCustomRole: (id: string) => request<void>(`/custom-roles/${id}`, { method: "DELETE" }),

  // ---------- Business Goals (Group Integrator / Superadmin manage; everyone reads) ----------
  businessGoals: () => request<BusinessGoal[]>("/business-goals"),
  createBusinessGoal: (payload: { name: string; description?: string; businessUnitIds?: string[] }) =>
    request<BusinessGoal>("/business-goals", { method: "POST", body: JSON.stringify(payload) }),
  updateBusinessGoal: (id: string, payload: Partial<{ name: string; description: string; businessUnitIds: string[] }>) =>
    request<BusinessGoal>(`/business-goals/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteBusinessGoal: (id: string) => request<void>(`/business-goals/${id}`, { method: "DELETE" }),

  // ---------- Rocks ----------
  rocks: (params: {
    yearId: string;
    quarter?: number;
    businessUnitId?: string;
    companyId?: string;
    businessGoalId?: string;
    status?: RockStatus;
  }) => {
    const qs = new URLSearchParams({ yearId: params.yearId });
    if (params.quarter) qs.set("quarter", String(params.quarter));
    if (params.businessUnitId) qs.set("businessUnitId", params.businessUnitId);
    if (params.companyId) qs.set("companyId", params.companyId);
    if (params.businessGoalId) qs.set("businessGoalId", params.businessGoalId);
    if (params.status) qs.set("status", params.status);
    return request<Rock[]>(`/rocks?${qs.toString()}`);
  },
  createRock: (payload: {
    companyId: string;
    yearId: string;
    quarter: number;
    businessGoalId?: string | null;
    title: string;
    description?: string;
    remarks?: string;
    ownerName?: string;
    status?: RockStatus;
    progressPct?: number;
  }) => request<Rock>("/rocks", { method: "POST", body: JSON.stringify(payload) }),
  updateRock: (
    id: string,
    payload: Partial<{
      quarter: number;
      businessGoalId: string | null;
      title: string;
      description: string;
      remarks: string;
      ownerName: string;
      status: RockStatus;
      progressPct: number;
    }>
  ) => request<Rock>(`/rocks/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteRock: (id: string) => request<void>(`/rocks/${id}`, { method: "DELETE" }),
  // Carries every not-yet-complete Rock in scope forward one quarter (Group
  // Integrator/Superadmin only). Q4 rolls into Q1 of the following Year,
  // which must already exist.
  rolloverRocks: (payload: {
    yearId: string;
    quarter: number;
    businessUnitId?: string;
    companyId?: string;
    businessGoalId?: string;
  }) =>
    request<{ rolledOver: number; targetYearId: string; targetQuarter: number; rocks: Rock[] }>("/rocks/rollover", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
