import type {
  AuthUser,
  BusinessUnit,
  Company,
  DashboardResponse,
  Figures,
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
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: AuthUser }>("/auth/me"),

  years: () => request<Year[]>("/years"),
  createYear: (year: number) => request<Year>("/years", { method: "POST", body: JSON.stringify({ year }) }),

  businessUnits: () => request<BusinessUnit[]>("/business-units"),
  createBusinessUnit: (name: string) =>
    request<BusinessUnit>("/business-units", { method: "POST", body: JSON.stringify({ name }) }),

  companies: (businessUnitId?: string) =>
    request<Company[]>(`/companies${businessUnitId ? `?businessUnitId=${businessUnitId}` : ""}`),
  createCompany: (name: string, businessUnitId: string) =>
    request<Company>("/companies", { method: "POST", body: JSON.stringify({ name, businessUnitId }) }),

  dashboard: (params: { yearId: string; quarter: number; businessUnitId?: string; companyId?: string }) => {
    const qs = new URLSearchParams({ yearId: params.yearId, quarter: String(params.quarter) });
    if (params.businessUnitId) qs.set("businessUnitId", params.businessUnitId);
    if (params.companyId) qs.set("companyId", params.companyId);
    return request<DashboardResponse>(`/dashboard?${qs.toString()}`);
  },

  annualTargets: (yearId: string, businessUnitId?: string) => {
    const qs = new URLSearchParams({ yearId });
    if (businessUnitId) qs.set("businessUnitId", businessUnitId);
    return request<any[]>(`/targets/annual?${qs.toString()}`);
  },
  putAnnualTarget: (payload: { companyId: string; yearId: string } & Figures) =>
    request<any>("/targets/annual", { method: "PUT", body: JSON.stringify(payload) }),

  quarterTargets: (yearId: string, quarter?: number, businessUnitId?: string) => {
    const qs = new URLSearchParams({ yearId });
    if (quarter) qs.set("quarter", String(quarter));
    if (businessUnitId) qs.set("businessUnitId", businessUnitId);
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
  putActual: (payload: { companyId: string; yearId: string; quarter: number; remarks?: string } & Figures) =>
    request<any>("/actuals", { method: "PUT", body: JSON.stringify(payload) }),

  patchRemarks: (companyId: string, yearId: string, quarter: number, remarks: string) =>
    request<any>(`/actuals/${companyId}/${yearId}/${quarter}/remarks`, {
      method: "PATCH",
      body: JSON.stringify({ remarks }),
    }),
};
