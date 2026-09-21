import { Router } from "express";
import { prisma } from "../lib/prisma";
import { blockPendingPasswordChange, loadUserPermissions, requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

/**
 * Access gate: Superadmins can always open the Audit Log — it lives under
 * Admin, but (per the same pattern as the Executive Scorecard) a non-
 * superadmin can also be granted access via a Custom Role that explicitly
 * checks AUDIT_LOG view. Unlike the other resources, this isn't checked
 * against any particular Business Unit/Company (the log itself isn't
 * scoped that way) — any RolePermission row with resource AUDIT_LOG and
 * canView true is enough, wherever it happens to be attached.
 */
router.use(async (req, res, next) => {
  const user = req.user!;
  if (user.role === "SUPERADMIN") return next();
  const permRows = await loadUserPermissions(user);
  if (permRows.some((r) => r.resource === "AUDIT_LOG" && r.canView)) return next();
  return res.status(403).json({ error: "You don't have access to the Audit Log" });
});

const MAX_PAGE_SIZE = 200;

/**
 * GET /api/audit-log
 * Query params (all optional): page (1-based, default 1), pageSize (default
 * 50, capped at 200), action, entityType, userId, from/to (ISO date strings,
 * inclusive), q (free-text search over summary/userName/userEmail).
 */
router.get("/", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(q.pageSize) || 50));

  const where: any = {};
  if (q.action) where.action = q.action;
  if (q.entityType) where.entityType = q.entityType;
  if (q.userId) where.userId = q.userId;
  if (q.from || q.to) {
    where.createdAt = {};
    if (q.from) where.createdAt.gte = new Date(q.from);
    if (q.to) where.createdAt.lte = new Date(q.to);
  }
  if (q.q) {
    where.OR = [
      { summary: { contains: q.q, mode: "insensitive" } },
      { userName: { contains: q.q, mode: "insensitive" } },
      { userEmail: { contains: q.q, mode: "insensitive" } },
    ];
  }

  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({ entries, total, page, pageSize });
});

// Distinct action/entityType values actually present in the log, so the
// frontend's filter dropdowns only ever show options with real matches
// instead of a hardcoded (and potentially stale) list.
router.get("/meta", async (_req, res) => {
  const [actions, entityTypes] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);
  res.json({
    actions: actions.map((a) => a.action),
    entityTypes: entityTypes.map((e) => e.entityType),
  });
});

export default router;
