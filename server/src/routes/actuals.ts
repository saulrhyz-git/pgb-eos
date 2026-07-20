import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  assertBusinessUnitAccess,
  blockPendingPasswordChange,
  loadUserPermissions,
  requireAuth,
  resolveCompanyBusinessUnit,
  scopedBusinessUnitFilter,
} from "../middleware/auth";
import { can, canAnyOf, FINANCIAL_RESOURCES, hasAnyGrant, PermissionError } from "../utils/permissions";
import { logAudit } from "../utils/auditLog";

const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

const figuresSchema = z.object({
  revenueInternal: z.number().min(0).default(0),
  revenueExternal: z.number().min(0).default(0),
  collectionsInternalEarned: z.number().min(0).default(0),
  collectionsInternalUnearned: z.number().min(0).default(0),
  collectionsInternalOthers: z.number().min(0).default(0),
  collectionsExternalEarned: z.number().min(0).default(0),
  collectionsExternalUnearned: z.number().min(0).default(0),
  collectionsExternalOthers: z.number().min(0).default(0),
  expensesInterest: z.number().min(0).default(0),
  expensesDepreciation: z.number().min(0).default(0),
  expensesOtherNonCash: z.number().min(0).default(0),
  // Split per breakdown rather than one shared note per parent category —
  // one Remarks field per Collections breakdown (6) and per Expenses
  // breakdown (3), plus Revenue's single field, same granularity Disbursements uses.
  revenueRemarks: z.string().max(2000).optional().default(""),
  collectionsInternalEarnedRemarks: z.string().max(2000).optional().default(""),
  collectionsInternalUnearnedRemarks: z.string().max(2000).optional().default(""),
  collectionsInternalOthersRemarks: z.string().max(2000).optional().default(""),
  collectionsExternalEarnedRemarks: z.string().max(2000).optional().default(""),
  collectionsExternalUnearnedRemarks: z.string().max(2000).optional().default(""),
  collectionsExternalOthersRemarks: z.string().max(2000).optional().default(""),
  expensesInterestRemarks: z.string().max(2000).optional().default(""),
  expensesDepreciationRemarks: z.string().max(2000).optional().default(""),
  expensesOtherNonCashRemarks: z.string().max(2000).optional().default(""),
});

router.get("/", async (req, res) => {
  const { yearId, quarter, businessUnitId, companyId } = req.query as Record<string, string | undefined>;
  if (!yearId) return res.status(400).json({ error: "yearId is required" });

  const user = req.user!;
  const permRows = await loadUserPermissions(user);

  try {
    if (companyId) {
      const buId = await resolveCompanyBusinessUnit(companyId);
      assertBusinessUnitAccess(user, buId);
      if (hasAnyGrant(permRows, FINANCIAL_RESOURCES) && !canAnyOf(permRows, "view", FINANCIAL_RESOURCES, { businessUnitId: buId, companyId })) {
        throw new PermissionError("Your assigned role does not grant view access to any financial category here");
      }
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const where: any = { yearId };
  if (quarter) where.quarter = Number(quarter);

  if (companyId) {
    where.companyId = companyId;
  } else {
    let buFilter: string | { in: string[] } | undefined;
    try {
      buFilter = scopedBusinessUnitFilter(user, businessUnitId);
    } catch (err: any) {
      return res.status(err.status || 500).json({ error: err.message });
    }

    if (hasAnyGrant(permRows, FINANCIAL_RESOURCES)) {
      const companyWhere: any = {};
      if (buFilter) companyWhere.businessUnitId = buFilter;
      const candidates = await prisma.company.findMany({ where: companyWhere, select: { id: true, businessUnitId: true } });
      const permittedIds = candidates
        .filter((c) => canAnyOf(permRows, "view", FINANCIAL_RESOURCES, { businessUnitId: c.businessUnitId, companyId: c.id }))
        .map((c) => c.id);
      where.companyId = { in: permittedIds };
    } else if (buFilter) {
      where.company = { businessUnitId: buFilter };
    }
  }

  const actuals = await prisma.quarterActual.findMany({
    where,
    include: { company: { select: { id: true, name: true, businessUnitId: true } } },
    orderBy: { quarter: "asc" },
  });
  res.json(actuals);
});

// Upsert a quarter actual. BU Integrators may only post to companies within their
// assigned business unit(s); Group Integrators can post/override for any company.
router.put("/", async (req, res) => {
  const parsed = z
    .object({ companyId: z.string().uuid(), yearId: z.string().uuid(), quarter: z.number().int().min(1).max(4) })
    .merge(figuresSchema)
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid actuals payload", details: parsed.error.issues });

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(parsed.data.companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
    const permRows = await loadUserPermissions(req.user!);
    // The form submits Revenue/Collections/Expenses together in one payload,
    // so — since permissions are granted per-category — this only requires
    // edit access to at least one of the three; it can't yet block editing
    // just the one category a role isn't supposed to touch within the same
    // submission (see the per-category PATCH remarks endpoint below for a
    // fully granular example).
    if (hasAnyGrant(permRows, FINANCIAL_RESOURCES) && !canAnyOf(permRows, "edit", FINANCIAL_RESOURCES, { businessUnitId, companyId: parsed.data.companyId })) {
      throw new PermissionError("Your assigned role does not grant edit access to any financial category here");
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const { companyId, yearId, quarter, ...figures } = parsed.data;
  const actual = await prisma.quarterActual.upsert({
    where: { companyId_yearId_quarter: { companyId, yearId, quarter } },
    update: { ...figures, updatedById: req.user!.id },
    create: { companyId, yearId, quarter, ...figures, updatedById: req.user!.id },
  });
  await logAudit({
    user: req.user,
    action: "ACTUAL_UPDATE",
    entityType: "QuarterActual",
    entityId: actual.id,
    summary: `Updated Q${quarter} actuals for Company ${companyId}`,
    metadata: { companyId, yearId, quarter, figures },
  });
  res.json(actual);
});

// Lightweight endpoint for updating just one or more of the per-category
// Remarks fields inline from the operational grid, without resubmitting the
// whole quarter's figures.
const remarksPatchSchema = z
  .object({
    revenueRemarks: z.string().max(2000),
    collectionsInternalEarnedRemarks: z.string().max(2000),
    collectionsInternalUnearnedRemarks: z.string().max(2000),
    collectionsInternalOthersRemarks: z.string().max(2000),
    collectionsExternalEarnedRemarks: z.string().max(2000),
    collectionsExternalUnearnedRemarks: z.string().max(2000),
    collectionsExternalOthersRemarks: z.string().max(2000),
    expensesInterestRemarks: z.string().max(2000),
    expensesDepreciationRemarks: z.string().max(2000),
    expensesOtherNonCashRemarks: z.string().max(2000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one remarks field is required" });

router.patch("/:companyId/:yearId/:quarter/remarks", async (req, res) => {
  const remarksParsed = remarksPatchSchema.safeParse(req.body);
  if (!remarksParsed.success) {
    return res.status(400).json({ error: remarksParsed.error.issues[0]?.message || "Invalid remarks payload" });
  }

  const { companyId, yearId } = req.params;
  const quarter = Number(req.params.quarter);

  try {
    const businessUnitId = await resolveCompanyBusinessUnit(companyId);
    assertBusinessUnitAccess(req.user!, businessUnitId);
    const permRows = await loadUserPermissions(req.user!);
    if (hasAnyGrant(permRows, FINANCIAL_RESOURCES)) {
      // Unlike the combined figures PUT above, remarks are submitted one
      // field at a time, so this can enforce edit access per exact
      // underlying category resource instead of "any one of the three" —
      // every Collections breakdown remarks field maps to COLLECTIONS, every
      // Expenses breakdown remarks field maps to EXPENSES, since there's no
      // more granular Custom Role resource than the parent category.
      const fieldResource: Record<string, "REVENUE" | "COLLECTIONS" | "EXPENSES"> = {
        revenueRemarks: "REVENUE",
        collectionsInternalEarnedRemarks: "COLLECTIONS",
        collectionsInternalUnearnedRemarks: "COLLECTIONS",
        collectionsInternalOthersRemarks: "COLLECTIONS",
        collectionsExternalEarnedRemarks: "COLLECTIONS",
        collectionsExternalUnearnedRemarks: "COLLECTIONS",
        collectionsExternalOthersRemarks: "COLLECTIONS",
        expensesInterestRemarks: "EXPENSES",
        expensesDepreciationRemarks: "EXPENSES",
        expensesOtherNonCashRemarks: "EXPENSES",
      };
      for (const field of Object.keys(remarksParsed.data)) {
        const resource = fieldResource[field];
        if (resource && !can(permRows, "edit", resource, { businessUnitId, companyId })) {
          throw new PermissionError(`Your assigned role does not grant edit access to ${resource.toLowerCase()} remarks here`);
        }
      }
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const actual = await prisma.quarterActual.upsert({
    where: { companyId_yearId_quarter: { companyId, yearId, quarter } },
    update: { ...remarksParsed.data, updatedById: req.user!.id },
    create: {
      companyId,
      yearId,
      quarter,
      ...remarksParsed.data,
      updatedById: req.user!.id,
    },
  });
  await logAudit({
    user: req.user,
    action: "ACTUAL_REMARKS_UPDATE",
    entityType: "QuarterActual",
    entityId: actual.id,
    summary: `Updated Q${quarter} actuals remarks for Company ${companyId}`,
    metadata: { companyId, yearId, quarter, changedFields: Object.keys(remarksParsed.data) },
  });
  res.json(actual);
});

export default router;
