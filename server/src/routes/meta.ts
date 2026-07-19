import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { blockPendingPasswordChange, loadUserPermissions, requireAuth, requireRole, scopedBusinessUnitFilter } from "../middleware/auth";
import { canAny } from "../utils/permissions";
import { currentCalendarQuarter } from "../utils/quarterDates";
import { logAudit } from "../utils/auditLog";

const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

// ---------- Years ----------

router.get("/years", async (_req, res) => {
  const years = await prisma.year.findMany({ orderBy: { year: "desc" } });
  res.json(years);
});

// The real calendar quarter "right now" (server clock, UTC — see
// utils/quarterDates.ts), plus the matching Year row's id if one has been
// created yet. Lets the frontend default filters to the actual current
// quarter instead of guessing from the client's local clock, and gives any
// future date/quarter-gated feature one authoritative source of truth.
router.get("/current-quarter", async (_req, res) => {
  const { year, quarter, start, end } = currentCalendarQuarter();
  const yearRow = await prisma.year.findUnique({ where: { year } });
  res.json({ year, quarter, yearId: yearRow?.id ?? null, start, end });
});

router.post("/years", requireRole("GROUP_INTEGRATOR", "SUPERADMIN"), async (req, res) => {
  const parsed = z.object({ year: z.number().int().min(2000).max(2100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Valid 'year' is required" });
  const year = await prisma.year.upsert({
    where: { year: parsed.data.year },
    update: {},
    create: { year: parsed.data.year },
  });
  await logAudit({
    user: req.user,
    action: "YEAR_CREATE",
    entityType: "Year",
    entityId: year.id,
    summary: `Created Year ${year.year}`,
  });
  res.status(201).json(year);
});

// ---------- Business Units ----------

router.get("/business-units", async (req, res) => {
  const user = req.user!;
  let where: any = {};
  try {
    const buFilter = scopedBusinessUnitFilter(user);
    if (buFilter) where = { id: buFilter };
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  let bus = await prisma.businessUnit.findMany({
    where,
    include: { companies: { select: { id: true, name: true, businessUnitId: true } } },
    orderBy: { name: "asc" },
  });

  const permRows = await loadUserPermissions(user);
  if (permRows.length) {
    // A Custom Role narrows which Business Units/Companies even show up in
    // dropdowns app-wide, using "any view, on anything" so a role scoped to
    // just ROCKS (say) can still find the right Company on the Rocks page
    // even though it has no financial view at all.
    bus = bus
      .map((bu) => ({
        ...bu,
        companies: bu.companies.filter((c) => canAny(permRows, "view", { businessUnitId: bu.id, companyId: c.id })),
      }))
      .filter((bu) => canAny(permRows, "view", { businessUnitId: bu.id }) || bu.companies.length > 0);
  }

  res.json(bus);
});

router.post("/business-units", requireRole("GROUP_INTEGRATOR", "SUPERADMIN"), async (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "'name' is required" });
  const bu = await prisma.businessUnit.create({ data: { name: parsed.data.name } });
  await logAudit({
    user: req.user,
    action: "BUSINESS_UNIT_CREATE",
    entityType: "BusinessUnit",
    entityId: bu.id,
    summary: `Created Business Unit "${bu.name}"`,
  });
  res.status(201).json(bu);
});

router.post("/business-units/:id/assign", requireRole("GROUP_INTEGRATOR", "SUPERADMIN"), async (req, res) => {
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "'userId' is required" });
  const assignment = await prisma.userBusinessUnit.upsert({
    where: { userId_businessUnitId: { userId: parsed.data.userId, businessUnitId: req.params.id } },
    update: {},
    create: { userId: parsed.data.userId, businessUnitId: req.params.id },
  });
  res.status(201).json(assignment);
});

// ---------- Companies ----------

router.get("/companies", async (req, res) => {
  const user = req.user!;
  const businessUnitId = req.query.businessUnitId as string | undefined;

  const where: any = {};
  try {
    const buFilter = scopedBusinessUnitFilter(user, businessUnitId);
    if (buFilter) where.businessUnitId = buFilter;
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  let companies = await prisma.company.findMany({ where, orderBy: { name: "asc" } });

  const permRows = await loadUserPermissions(user);
  if (permRows.length) {
    companies = companies.filter((c) => canAny(permRows, "view", { businessUnitId: c.businessUnitId, companyId: c.id }));
  }

  res.json(companies);
});

router.post("/companies", requireRole("GROUP_INTEGRATOR", "SUPERADMIN"), async (req, res) => {
  const parsed = z
    .object({
      name: z.string().min(1),
      businessUnitId: z.string().uuid(),
      description: z.string().max(2000).optional().default(""),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "'name' and 'businessUnitId' are required" });
  const company = await prisma.company.create({ data: parsed.data });
  await logAudit({
    user: req.user,
    action: "COMPANY_CREATE",
    entityType: "Company",
    entityId: company.id,
    summary: `Created Company "${company.name}"`,
  });
  res.status(201).json(company);
});

// ---------- Users (Group Integrator admin only, used to assign BU Integrators) ----------

router.get("/users", requireRole("GROUP_INTEGRATOR", "SUPERADMIN"), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      businessUnits: { select: { businessUnit: { select: { id: true, name: true } } } },
    },
    orderBy: { name: "asc" },
  });
  res.json(users);
});

export default router;
