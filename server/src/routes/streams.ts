import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  assertBusinessUnitAccess,
  AuthUser,
  blockPendingPasswordChange,
  loadUserPermissions,
  requireAuth,
  resolveCompanyBusinessUnit,
  scopedBusinessUnitFilter,
} from "../middleware/auth";
import { Action, can, narrowingApplies, PermissionError, PermissionRow } from "../utils/permissions";
import { logAudit } from "../utils/auditLog";
import { assertYearOpen } from "../utils/yearLock";
import { n } from "../utils/aggregate";
import { ALL_STREAM_AMOUNT_FIELDS, STREAM_AMOUNT_FIELDS, STREAM_CATEGORIES, STREAM_CATEGORY_RESOURCE, StreamCategory } from "../utils/streams";

// ---------------------------------------------------------------------------
// Financial Streams (see FinancialStream in schema.prisma).
//
//   GET    /api/streams                 stream definitions in scope
//   GET    /api/streams/can-manage      may the caller add streams here?
//   POST   /api/streams                 create (BU-wide or one Company)
//   PUT    /api/streams/:id             rename / describe / (de)activate / reorder
//   DELETE /api/streams/:id             only if it has no recorded amounts
//   GET    /api/streams/actuals         a Company's stream amounts for a quarter
//   PUT    /api/streams/actuals         save a Company's stream amounts for a quarter
//
// Who can manage stream DEFINITIONS is set in the role matrix (resource
// STREAMS): edit = create/rename/deactivate, delete = delete. Without a
// Custom Role that mentions STREAMS, the base role decides — Superadmins,
// Group Integrators and BU Integrators can manage streams for the Business
// Units they're assigned to (same reach they already have for data entry).
// A blank-role user needs an explicit STREAMS grant.
//
// Entering a stream's AMOUNTS follows the same rule as the original figures:
// edit on that category's resource (REVENUE / COLLECTIONS / EXPENSES /
// DISBURSEMENTS) for the Company, and the Year must not be wrapped up.
// ---------------------------------------------------------------------------
const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

const RESERVED_LABELS = ["original figures"];

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function sendError(res: any, err: any) {
  return res.status(err.status || 500).json({ error: err.message });
}

async function canManageStreams(user: AuthUser, permRows: PermissionRow[], action: Action, ctx: { businessUnitId: string; companyId?: string }): Promise<boolean> {
  try {
    assertBusinessUnitAccess(user, ctx.businessUnitId);
  } catch {
    return false;
  }
  if (narrowingApplies(Boolean(user.role), permRows, ["STREAMS"])) return can(permRows, action, "STREAMS", ctx);
  return true; // base role (SUPERADMIN / GROUP_INTEGRATOR / BU_INTEGRATOR) within its BU access
}

async function assertCanManage(user: AuthUser, permRows: PermissionRow[], action: Action, ctx: { businessUnitId: string; companyId?: string }) {
  if (!(await canManageStreams(user, permRows, action, ctx))) {
    throw new PermissionError(
      action === "delete" ? "Your role doesn't allow deleting streams here" : "Your role doesn't allow managing streams here"
    );
  }
}

// The BU a stream belongs to (directly, or through its Company).
async function streamBusinessUnitId(stream: { businessUnitId: string | null; companyId: string | null }): Promise<string> {
  if (stream.businessUnitId) return stream.businessUnitId;
  return resolveCompanyBusinessUnit(stream.companyId!);
}

/**
 * A label must be unique (case-insensitive) within a category among every
 * stream a Company could see together: its own Company streams plus its
 * Business Unit's BU-wide streams. Otherwise two different streams would
 * read the same in Data Entry and reports.
 */
async function assertLabelAvailable(params: { category: StreamCategory; label: string; businessUnitId: string; companyId?: string; excludeId?: string }) {
  const label = params.label.trim();
  if (RESERVED_LABELS.includes(label.toLowerCase())) throw new HttpError(400, `"${label}" is reserved for the original figures — pick another label.`);

  const companyIdsInBu = (await prisma.company.findMany({ where: { businessUnitId: params.businessUnitId }, select: { id: true } })).map((c) => c.id);
  const candidates = await prisma.financialStream.findMany({
    where: {
      category: params.category,
      id: params.excludeId ? { not: params.excludeId } : undefined,
      label: { equals: label, mode: "insensitive" },
      OR: params.companyId
        ? [{ businessUnitId: params.businessUnitId }, { companyId: params.companyId }]
        : [{ businessUnitId: params.businessUnitId }, { companyId: { in: companyIdsInBu } }],
    },
    include: { company: { select: { name: true } }, businessUnit: { select: { name: true } } },
  });
  if (candidates.length) {
    const c = candidates[0];
    const where = c.company ? `Company ${c.company.name}` : `all of ${c.businessUnit?.name}`;
    throw new HttpError(409, `A ${params.category.toLowerCase()} stream called "${c.label}" already exists for ${where}.`);
  }
}

const streamInclude = {
  businessUnit: { select: { id: true, name: true } },
  company: { select: { id: true, name: true, businessUnitId: true } },
  _count: { select: { actuals: true } },
} as const;

// ---------- Definitions ----------

router.get("/", async (req, res) => {
  const user = req.user!;
  const { businessUnitId, companyId, category, includeInactive } = req.query as Record<string, string | undefined>;
  if (category && !STREAM_CATEGORIES.includes(category as StreamCategory)) return res.status(400).json({ error: "Invalid category" });

  let where: any = {};
  try {
    if (companyId) {
      // Every stream that applies to this Company: its own + its BU's BU-wide ones.
      const buId = await resolveCompanyBusinessUnit(companyId);
      assertBusinessUnitAccess(user, buId);
      where = { OR: [{ companyId }, { businessUnitId: buId }] };
    } else {
      const buFilter = scopedBusinessUnitFilter(user, businessUnitId);
      if (buFilter) where = { OR: [{ businessUnitId: buFilter }, { company: { businessUnitId: buFilter } }] };
    }
  } catch (err: any) {
    return sendError(res, err);
  }
  if (category) where.category = category;
  if (includeInactive !== "true") where.active = true;

  const permRows = await loadUserPermissions(user);
  const streams = await prisma.financialStream.findMany({
    where,
    include: streamInclude,
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
  });

  const out = [];
  for (const s of streams) {
    const buId = s.businessUnitId || s.company!.businessUnitId;
    const ctx = { businessUnitId: buId, companyId: s.companyId || undefined };
    out.push({
      id: s.id,
      category: s.category,
      label: s.label,
      description: s.description,
      active: s.active,
      sortOrder: s.sortOrder,
      scope: s.companyId ? "COMPANY" : "BUSINESS_UNIT",
      businessUnitId: buId,
      businessUnitName: s.businessUnit?.name ?? null,
      companyId: s.companyId,
      companyName: s.company?.name ?? null,
      entryCount: s._count.actuals,
      canEdit: await canManageStreams(user, permRows, "edit", ctx),
      canDelete: await canManageStreams(user, permRows, "delete", ctx),
    });
  }
  res.json(out);
});

router.get("/can-manage", async (req, res) => {
  const { businessUnitId, companyId } = req.query as Record<string, string | undefined>;
  if (!businessUnitId) return res.status(400).json({ error: "businessUnitId is required" });
  const permRows = await loadUserPermissions(req.user!);
  res.json({ canManage: await canManageStreams(req.user!, permRows, "edit", { businessUnitId, companyId }) });
});

const createSchema = z
  .object({
    category: z.enum(["REVENUE", "COLLECTIONS", "EXPENSES", "DISBURSEMENTS"]),
    label: z.string().trim().min(1, "A label is required").max(120),
    description: z.string().max(1000).optional().default(""),
    businessUnitId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.businessUnitId) !== Boolean(v.companyId), { message: "Pick either a Business Unit (BU-wide stream) or a Company, not both" });

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid stream" });
  const { category, label, description, companyId } = parsed.data;
  const user = req.user!;

  try {
    const businessUnitId = companyId ? await resolveCompanyBusinessUnit(companyId) : parsed.data.businessUnitId!;
    if (!companyId && !(await prisma.businessUnit.findUnique({ where: { id: businessUnitId } }))) throw new HttpError(404, "Business Unit not found");
    const permRows = await loadUserPermissions(user);
    await assertCanManage(user, permRows, "edit", { businessUnitId, companyId });
    await assertLabelAvailable({ category, label, businessUnitId, companyId });

    const maxOrder = await prisma.financialStream.aggregate({ where: { category, OR: [{ businessUnitId }, { companyId: companyId ?? "__none__" }] }, _max: { sortOrder: true } });
    const stream = await prisma.financialStream.create({
      data: {
        category,
        label: label.trim(),
        description,
        businessUnitId: companyId ? null : businessUnitId,
        companyId: companyId ?? null,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        createdById: user.id,
      },
      include: streamInclude,
    });
    await logAudit({
      user,
      action: "STREAM_CREATE",
      entityType: "FinancialStream",
      entityId: stream.id,
      summary: `Created ${category.toLowerCase()} stream "${stream.label}" for ${stream.company ? `Company ${stream.company.name}` : `all of ${stream.businessUnit?.name}`}`,
    });
    res.status(201).json(stream);
  } catch (err: any) {
    return sendError(res, err);
  }
});

const updateSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

router.put("/:id([0-9a-fA-F-]{36})", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid stream" });
  const user = req.user!;
  try {
    const existing = await prisma.financialStream.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Stream not found");
    const businessUnitId = await streamBusinessUnitId(existing);
    const permRows = await loadUserPermissions(user);
    await assertCanManage(user, permRows, "edit", { businessUnitId, companyId: existing.companyId || undefined });
    if (parsed.data.label && parsed.data.label.toLowerCase() !== existing.label.toLowerCase()) {
      await assertLabelAvailable({
        category: existing.category as StreamCategory,
        label: parsed.data.label,
        businessUnitId,
        companyId: existing.companyId || undefined,
        excludeId: existing.id,
      });
    }
    const stream = await prisma.financialStream.update({ where: { id: existing.id }, data: parsed.data, include: streamInclude });
    const changes: string[] = [];
    if (parsed.data.label && parsed.data.label !== existing.label) changes.push(`renamed from "${existing.label}"`);
    if (parsed.data.active !== undefined && parsed.data.active !== existing.active) changes.push(parsed.data.active ? "reactivated" : "deactivated");
    await logAudit({
      user,
      action: "STREAM_UPDATE",
      entityType: "FinancialStream",
      entityId: stream.id,
      summary: `Updated ${stream.category.toLowerCase()} stream "${stream.label}"${changes.length ? ` (${changes.join(", ")})` : ""}`,
      metadata: { changedFields: Object.keys(parsed.data) },
    });
    res.json(stream);
  } catch (err: any) {
    return sendError(res, err);
  }
});

router.delete("/:id([0-9a-fA-F-]{36})", async (req, res) => {
  const user = req.user!;
  try {
    const existing = await prisma.financialStream.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Stream not found");
    const businessUnitId = await streamBusinessUnitId(existing);
    const permRows = await loadUserPermissions(user);
    await assertCanManage(user, permRows, "delete", { businessUnitId, companyId: existing.companyId || undefined });

    // Deleting a stream with recorded amounts would silently change past
    // totals (and wrapped-up Years) — deactivate it instead. All-zero rows
    // change nothing, so those don't block deletion.
    const rows = await prisma.financialStreamActual.findMany({ where: { streamId: existing.id } });
    const recorded = rows.filter((r) => ALL_STREAM_AMOUNT_FIELDS.some((f) => n((r as any)[f]) !== 0));
    if (recorded.length) {
      throw new HttpError(
        409,
        `"${existing.label}" has amounts recorded in ${recorded.length} quarter${recorded.length === 1 ? "" : "s"}, so deleting it would change past totals. Deactivate it instead — it disappears from Data Entry but its history stays in every total and report.`
      );
    }
    await prisma.$transaction([
      prisma.financialStreamActual.deleteMany({ where: { streamId: existing.id } }),
      prisma.financialStream.delete({ where: { id: existing.id } }),
    ]);
    await logAudit({
      user,
      action: "STREAM_DELETE",
      entityType: "FinancialStream",
      entityId: existing.id,
      summary: `Deleted ${existing.category.toLowerCase()} stream "${existing.label}"`,
    });
    res.status(204).send();
  } catch (err: any) {
    return sendError(res, err);
  }
});

// ---------- Amounts ----------

function categoryAllowed(user: AuthUser, permRows: PermissionRow[], action: Action, category: StreamCategory, ctx: { businessUnitId: string; companyId: string }) {
  const resource = STREAM_CATEGORY_RESOURCE[category];
  if (!narrowingApplies(Boolean(user.role), permRows, [resource])) return true;
  return can(permRows, action, resource, ctx);
}

router.get("/actuals", async (req, res) => {
  const user = req.user!;
  const { yearId, companyId } = req.query as Record<string, string | undefined>;
  const quarter = Number(req.query.quarter);
  if (!yearId || !companyId || !(quarter >= 1 && quarter <= 4)) return res.status(400).json({ error: "yearId, companyId and quarter (1-4) are required" });

  let businessUnitId: string;
  try {
    businessUnitId = await resolveCompanyBusinessUnit(companyId);
    assertBusinessUnitAccess(user, businessUnitId);
  } catch (err: any) {
    return sendError(res, err);
  }
  const permRows = await loadUserPermissions(user);

  const [streams, actuals] = await Promise.all([
    prisma.financialStream.findMany({
      where: { OR: [{ companyId }, { businessUnitId }] },
      include: { businessUnit: { select: { name: true } }, company: { select: { name: true } } },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    prisma.financialStreamActual.findMany({ where: { yearId, companyId, quarter } }),
  ]);
  const actualByStream = new Map(actuals.map((a) => [a.streamId, a]));
  const ctx = { businessUnitId, companyId };

  const rows = streams
    // Inactive streams only show up if they already hold an amount for this
    // quarter, so recorded history stays visible (and correctable).
    .filter((s) => s.active || actualByStream.has(s.id))
    .filter((s) => categoryAllowed(user, permRows, "view", s.category as StreamCategory, ctx))
    .map((s) => {
      const a = actualByStream.get(s.id);
      const fields = STREAM_AMOUNT_FIELDS[s.category as StreamCategory];
      return {
        streamId: s.id,
        category: s.category,
        label: s.label,
        description: s.description,
        active: s.active,
        scope: s.companyId ? "COMPANY" : "BUSINESS_UNIT",
        scopeName: s.company?.name || s.businessUnit?.name || "",
        canEdit: categoryAllowed(user, permRows, "edit", s.category as StreamCategory, ctx),
        amounts: Object.fromEntries(fields.map((f) => [f, a ? n((a as any)[f]) : 0])),
        remarks: a?.remarks ?? "",
        updatedAt: a?.updatedAt ?? null,
      };
    });
  res.json(rows);
});

const amountsSchema = z.record(z.string(), z.number().min(0).max(1e12));
const saveSchema = z.object({
  companyId: z.string().uuid(),
  yearId: z.string().uuid(),
  quarter: z.number().int().min(1).max(4),
  entries: z
    .array(z.object({ streamId: z.string().uuid(), amounts: amountsSchema, remarks: z.string().max(2000).optional().default("") }))
    .min(1)
    .max(200),
});

router.put("/actuals", async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid stream amounts" });
  const { companyId, yearId, quarter, entries } = parsed.data;
  const user = req.user!;

  try {
    await assertYearOpen(yearId);
    const businessUnitId = await resolveCompanyBusinessUnit(companyId);
    assertBusinessUnitAccess(user, businessUnitId);
    const permRows = await loadUserPermissions(user);
    const ctx = { businessUnitId, companyId };

    const streams = await prisma.financialStream.findMany({ where: { id: { in: entries.map((e) => e.streamId) } } });
    const byId = new Map(streams.map((s) => [s.id, s]));
    const existing = await prisma.financialStreamActual.findMany({ where: { companyId, yearId, quarter, streamId: { in: entries.map((e) => e.streamId) } } });
    const hasExisting = new Set(existing.map((e) => e.streamId));

    const writes = entries.map((e) => {
      const s = byId.get(e.streamId);
      if (!s) throw new HttpError(404, "One of these streams no longer exists — refresh and try again.");
      if (s.companyId !== companyId && s.businessUnitId !== businessUnitId) throw new HttpError(400, `"${s.label}" doesn't apply to this Company.`);
      if (!s.active && !hasExisting.has(s.id)) throw new HttpError(400, `"${s.label}" is deactivated, so new amounts can't be added to it.`);
      const category = s.category as StreamCategory;
      if (!categoryAllowed(user, permRows, "edit", category, ctx)) {
        throw new PermissionError(`Your role doesn't allow editing ${category.toLowerCase()} for this Company`);
      }
      // Only the category's own columns are kept; every other amount column is 0.
      const allowed = STREAM_AMOUNT_FIELDS[category];
      const unknown = Object.keys(e.amounts).filter((k) => !allowed.includes(k));
      if (unknown.length) throw new HttpError(400, `"${s.label}" is a ${category.toLowerCase()} stream and doesn't take ${unknown.join(", ")}.`);
      const amounts = Object.fromEntries(ALL_STREAM_AMOUNT_FIELDS.map((f) => [f, allowed.includes(f) ? Math.round((e.amounts[f] ?? 0) * 100) / 100 : 0]));
      return prisma.financialStreamActual.upsert({
        where: { streamId_companyId_yearId_quarter: { streamId: s.id, companyId, yearId, quarter } },
        update: { ...amounts, remarks: e.remarks, updatedById: user.id },
        create: { streamId: s.id, companyId, yearId, quarter, ...amounts, remarks: e.remarks, updatedById: user.id },
      });
    });

    const saved = await prisma.$transaction(writes);
    await logAudit({
      user,
      action: "STREAM_ACTUAL_UPDATE",
      entityType: "FinancialStreamActual",
      entityId: null,
      summary: `Updated Q${quarter} amounts for ${entries.length} stream${entries.length === 1 ? "" : "s"}, Company ${companyId}`,
      metadata: { companyId, yearId, quarter, streams: entries.map((e) => ({ streamId: e.streamId, label: byId.get(e.streamId)?.label, amounts: e.amounts })) },
    });
    res.json({ saved: saved.length });
  } catch (err: any) {
    return sendError(res, err);
  }
});

export default router;
