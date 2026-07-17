import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// ---------- Years ----------

router.get("/years", async (_req, res) => {
  const years = await prisma.year.findMany({ orderBy: { year: "desc" } });
  res.json(years);
});

router.post("/years", requireRole("GROUP_INTEGRATOR"), async (req, res) => {
  const parsed = z.object({ year: z.number().int().min(2000).max(2100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Valid 'year' is required" });
  const year = await prisma.year.upsert({
    where: { year: parsed.data.year },
    update: {},
    create: { year: parsed.data.year },
  });
  res.status(201).json(year);
});

// ---------- Business Units ----------

router.get("/business-units", async (req, res) => {
  const user = req.user!;
  const where = user.role === "GROUP_INTEGRATOR" ? {} : { id: { in: user.businessUnitIds } };
  const bus = await prisma.businessUnit.findMany({
    where,
    include: { companies: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  res.json(bus);
});

router.post("/business-units", requireRole("GROUP_INTEGRATOR"), async (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "'name' is required" });
  const bu = await prisma.businessUnit.create({ data: { name: parsed.data.name } });
  res.status(201).json(bu);
});

router.post("/business-units/:id/assign", requireRole("GROUP_INTEGRATOR"), async (req, res) => {
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

  if (businessUnitId && user.role === "BU_INTEGRATOR" && !user.businessUnitIds.includes(businessUnitId)) {
    return res.status(403).json({ error: "You are not assigned to this Business Unit" });
  }

  const where: any = {};
  if (businessUnitId) where.businessUnitId = businessUnitId;
  else if (user.role === "BU_INTEGRATOR") where.businessUnitId = { in: user.businessUnitIds };

  const companies = await prisma.company.findMany({ where, orderBy: { name: "asc" } });
  res.json(companies);
});

router.post("/companies", requireRole("GROUP_INTEGRATOR"), async (req, res) => {
  const parsed = z
    .object({ name: z.string().min(1), businessUnitId: z.string().uuid() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "'name' and 'businessUnitId' are required" });
  const company = await prisma.company.create({ data: parsed.data });
  res.status(201).json(company);
});

// ---------- Users (Group Integrator admin only, used to assign BU Integrators) ----------

router.get("/users", requireRole("GROUP_INTEGRATOR"), async (_req, res) => {
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
