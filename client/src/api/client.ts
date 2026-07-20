import type {
  AdminUser,
  AuditLogMeta,
  AuditLogPage,
  AuthUser,
  BusinessGoal,
  BusinessUnit,
  Company,
  CustomRole,
  DashboardResponse,
  DisbursementActual,
  DisbursementCategory,
  Figures,
  Rock,
  RockStatus,
  Role,
  ReportResult,
  RolePermission,
  ScorecardResponse,
  SmtpSettings,
  TargetLockEntry,
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
  // Self-service profile update — name/email/username only. Description,
  // role, and Custom Role stay superadmin-only (see adminUpdateUser below).
  updateProfile: (payload: Partial<{ name: string; email: string; username: string | null }>) =>
    request<{ token: string; user: AuthUser }>("/auth/profile", { method: "PUT", body: JSON.stringify(payload) }),

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

  // Annual Target is still always derived on the Revenue dashboard (sum of
  // Q1-Q4 Quarter Target) — there's no separately *stored* annual figure.
  // putAnnualTarget below is a convenience that splits an entered annual
  // total evenly across the Year's still-editable quarters (see
  // server/src/routes/targets.ts).
  quarterTargets: (params: { yearId: string; quarter?: number; businessUnitId?: string; companyId?: string }) => {
    const qs = new URLSearchParams({ yearId: params.yearId });
    if (params.quarter) qs.set("quarter", String(params.quarter));
    if (params.businessUnitId) qs.set("businessUnitId", params.businessUnitId);
    if (params.companyId) qs.set("companyId", params.companyId);
    return request<any[]>(`/targets/quarter?${qs.toString()}`);
  },
  // Editing a quarter cascades: the delta is redistributed across that
  // Company's *subsequent* quarters of the same Year (never prior ones) so
  // the Q1-Q4 sum stays what it was before the edit. Quarters that have
  // already passed (real calendar) are rejected with a 403.
  putQuarterTarget: (payload: { companyId: string; yearId: string; quarter: number } & Figures) =>
    request<any>("/targets/quarter", { method: "PUT", body: JSON.stringify(payload) }),
  // Splits an annual total evenly across the Year's still-editable quarters
  // (quarters already locked by the real calendar keep their existing
  // values and are subtracted from the annual total first).
  putAnnualTarget: (payload: { companyId: string; yearId: string } & Figures) =>
    request<{ updated: any[]; lockedQuarters: number[] }>("/targets/annual", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  // ---------- Manual Target Locks (Group Integrator / Superadmin only) ----------
  // Applies to every Company at once for a given Year+Quarter — layered on
  // top of the calendar-based lock above, not a replacement for it.
  targetLocks: (yearId: string) => request<TargetLockEntry[]>(`/targets/locks?yearId=${yearId}`),
  lockTarget: (payload: { yearId: string; quarter: number }) =>
    request<{ quarter: number; lockedAt: string }>("/targets/lock", { method: "POST", body: JSON.stringify(payload) }),
  // `reason` is required — it's written to the Audit Log (TARGET_UNLOCK),
  // not stored on the lock itself.
  unlockTarget: (payload: { yearId: string; quarter: number; reason: string }) =>
    request<void>("/targets/unlock", { method: "POST", body: JSON.stringify(payload) }),

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
    // Omit or pass null for a "blank" role user (Custom Role only).
    role: Role | null;
    // Superadmin-authored note about this user, shown in the app header in
    // place of their role. Not user-editable.
    description?: string;
    password: string;
    businessUnitIds?: string[];
    // Any number of Custom Roles to assign — their grants are merged.
    customRoleIds?: string[];
  }) => request<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateUser: (
    id: string,
    payload: Partial<{
      email: string;
      username: string | null;
      name: string;
      role: Role | null;
      description: string;
      businessUnitIds: string[];
      password: string;
      customRoleIds: string[];
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

  // ---------- Executive Scorecard ----------
  // Condensed, BU-level-only summary for a C-Level/BOD audience. Default
  // access is Superadmin + Group Integrator; a BU Integrator needs a Custom
  // Role that grants SCORECARD view to see it at all (403 otherwise).
  scorecard: (params: { yearId: string; quarter: number; businessUnitId?: string }) => {
    // quarter === 0 means "All Quarters" (full year) in the UI, same convention as the Revenue dashboard.
    const qs = new URLSearchParams({ yearId: params.yearId, quarter: params.quarter === 0 ? "all" : String(params.quarter) });
    if (params.businessUnitId) qs.set("businessUnitId", params.businessUnitId);
    return request<ScorecardResponse>(`/scorecard?${qs.toString()}`);
  },

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

  // ---------- Audit Log ----------
  // Default access is Superadmin; a non-superadmin needs a Custom Role that
  // grants AUDIT_LOG view to see this at all (403 otherwise). Not scoped to
  // any particular Business Unit/Company.
  auditLog: (params: {
    page?: number;
    pageSize?: number;
    action?: string;
    entityType?: string;
    userId?: string;
    from?: string;
    to?: string;
    q?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.pageSize) qs.set("pageSize", String(params.pageSize));
    if (params.action) qs.set("action", params.action);
    if (params.entityType) qs.set("entityType", params.entityType);
    if (params.userId) qs.set("userId", params.userId);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.q) qs.set("q", params.q);
    const query = qs.toString();
    return request<AuditLogPage>(`/audit-log${query ? `?${query}` : ""}`);
  },
  auditLogMeta: () => request<AuditLogMeta>("/audit-log/meta"),

  // ---------- Reports engine ----------
  // Default access is Superadmin + Group Integrator (same as the Executive
  // Scorecard); a BU Integrator (or blank-role user) needs a Custom Role that
  // grants REPORTS view to see this at all (403 otherwise). Every report type
  // below returns the same generic { title, scope, columns, rows } shape —
  // see ReportResult in ./types and server/src/routes/reports.ts.
  reportFinancial: (params: { yearId: string; quarter?: number; businessUnitId?: string; companyId?: string }) => {
    // quarter omitted or 0 means "All Quarters" (full year), same convention as the Revenue dashboard.
    const qs = new URLSearchParams({ yearId: params.yearId, quarter: !params.quarter ? "all" : String(params.quarter) });
    if (params.businessUnitId) qs.set("businessUnitId", params.businessUnitId);
    if (params.companyId) qs.set("companyId", params.companyId);
    return request<ReportResult>(`/reports/financial?${qs.toString()}`);
  },
  reportRocks: (params: {
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
    return request<ReportResult>(`/reports/rocks?${qs.toString()}`);
  },
  reportExecutiveSummary: (params: { yearId: string; quarter?: number; businessUnitId?: string }) => {
    const qs = new URLSearchParams({ yearId: params.yearId, quarter: !params.quarter ? "all" : String(params.quarter) });
    if (params.businessUnitId) qs.set("businessUnitId", params.businessUnitId);
    return request<ReportResult>(`/reports/executive-summary?${qs.toString()}`);
  },

  // ---------- Disbursements ----------
  // Recorded — not targeted — per Company/Year/Quarter, gated by a single
  // combined DISBURSEMENTS Custom Role resource (unlike Revenue/Collections/
  // Expenses, which are each independently gate-able). Default access is
  // Superadmin + Group Integrator's normal Business Unit scoping, same as
  // Revenue/Collections/Expenses actuals — see server/src/routes/disbursements.ts.
  disbursements: (params: { yearId: string; quarter?: number; businessUnitId?: string; companyId?: string }) => {
    const qs = new URLSearchParams({ yearId: params.yearId });
    if (params.quarter) qs.set("quarter", String(params.quarter));
    if (params.businessUnitId) qs.set("businessUnitId", params.businessUnitId);
    if (params.companyId) qs.set("companyId", params.companyId);
    return request<DisbursementActual[]>(`/disbursements?${qs.toString()}`);
  },
  // Upserts just ONE sub-category (Advances/Loans/Interests) for a Company/
  // Year/Quarter, leaving the other two categories' figures on the same row
  // untouched — each of the three Disbursements sub-tab pages submits only
  // its own category.
  putDisbursement: (payload: {
    companyId: string;
    yearId: string;
    quarter: number;
    category: DisbursementCategory;
    internal: number;
    external: number;
    remarks?: string;
  }) => request<DisbursementActual>("/disbursements", { method: "PUT", body: JSON.stringify(payload) }),
};
