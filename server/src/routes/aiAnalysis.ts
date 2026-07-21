import { Router } from "express";
import { prisma } from "../lib/prisma";
import { blockPendingPasswordChange, loadUserPermissions, requireAuth } from "../middleware/auth";
import { callGemini } from "../utils/gemini";
import { logAudit } from "../utils/auditLog";
import { computeScorecard } from "./scorecard";

const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

const AI_SETTINGS_ID = "default";

/**
 * Access gate: default is SUPERADMIN only (per the feature's design — this
 * calls out to a paid external API on the app's own key, so it's kept
 * tighter-default than the Executive Scorecard it's built on). A
 * non-superadmin can be granted access via a Custom Role that explicitly
 * grants AI_ANALYSIS view, same pattern as AUDIT_LOG (see routes/
 * auditLog.ts) — any RolePermission row with resource AI_ANALYSIS and
 * canView true is enough, wherever it happens to be attached. Once past
 * this coarse "can they open the page" gate, computeScorecard() below still
 * applies the normal Business-Unit scoping and REVENUE/COLLECTIONS/
 * EXPENSES/ROCKS/DISBURSEMENTS masking, so a scoped user only ever gets an
 * analysis of data they could already see on the Scorecard/Revenue/Rocks
 * pages.
 */
router.use(async (req, res, next) => {
  const user = req.user!;
  if (user.role === "SUPERADMIN") return next();
  const permRows = await loadUserPermissions(user);
  if (permRows.some((r) => r.resource === "AI_ANALYSIS" && r.canView)) return next();
  return res.status(403).json({ error: "You don't have access to AI Analysis" });
});

function formatMoney(n: number): string {
  return `PHP ${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatPct(n: number): string {
  return `${Math.round(n)}%`;
}

// Turns computeScorecard()'s data into a plain-text brief for Gemini —
// deliberately labeled sections rather than raw JSON, since a model
// generally reasons about (and cites) readable prose-adjacent data more
// reliably than a wall of nested JSON. Reuses the *exact* numbers the
// Executive Scorecard page shows (same masking/scoping already applied by
// computeScorecard), so the AI's narrative can never reveal anything the
// requesting user couldn't already see on that page.
function buildPrompt(data: Awaited<ReturnType<typeof computeScorecard>>, yearLabel: string, periodLabel: string, scopeLabel: string): string {
  const { revenue, rocks, disbursements } = data;
  const lines: string[] = [];

  lines.push(
    "You are a business analyst preparing an executive analysis for a company's leadership team that runs on EOS (the Entrepreneurial Operating System). Base your analysis strictly on the data provided below — do not invent figures or facts not present here."
  );
  lines.push("");
  lines.push(`=== PERIOD: ${yearLabel}, ${periodLabel} (${scopeLabel}) ===`);
  lines.push("");

  lines.push("=== REVENUE / COLLECTIONS / EXPENSES ===");
  lines.push(`Annual Revenue Target: ${formatMoney(revenue.kpis.annualRevenueTarget)}`);
  lines.push(`Annual Collections Target: ${formatMoney(revenue.kpis.annualCollectionsTarget)}`);
  lines.push(`Annual Expenses Target: ${formatMoney(revenue.kpis.annualExpensesTarget)}`);
  lines.push(
    `Period Revenue: Target ${formatMoney(revenue.kpis.quarterTarget)}, Actual ${formatMoney(revenue.kpis.quarterActual)} (${formatPct(
      revenue.kpis.attainmentPct
    )} attainment)`
  );
  lines.push(`Period Collections Target: ${formatMoney(revenue.kpis.quarterCollectionsTarget)}`);
  lines.push(
    `Period Expenses: Target ${formatMoney(revenue.kpis.quarterExpensesTarget)}, Actual ${formatMoney(revenue.kpis.quarterExpensesActual)}`
  );
  lines.push(`Net Income (Period Revenue Actual − Period Expenses Actual): ${formatMoney(revenue.kpis.netIncome)}`);
  lines.push(
    `Year-to-Date Revenue: Target ${formatMoney(revenue.kpis.ytdTarget)}, Actual ${formatMoney(revenue.kpis.ytdActual)} (${formatPct(
      revenue.kpis.ytdAttainmentPct
    )} attainment)`
  );
  if (revenue.businessUnits.length) {
    lines.push("");
    lines.push("Per-Business-Unit Revenue performance:");
    for (const bu of revenue.businessUnits) {
      lines.push(
        `- ${bu.businessUnitName}: Target ${formatMoney(bu.quarterTarget)}, Actual ${formatMoney(bu.quarterActual)} (${formatPct(
          bu.quarterAttainmentPct
        )} attainment); YTD Actual ${formatMoney(bu.ytdActual)} (${formatPct(bu.ytdVsAnnualPct)} of annual target)`
      );
    }
  }
  lines.push("");

  lines.push("=== ROCKS (90-day priorities) ===");
  lines.push(
    `Total: ${rocks.summary.total}, Target Met: ${rocks.summary.targetMet}, On Track: ${rocks.summary.onTrack}, At Risk: ${rocks.summary.atRisk}, Pending: ${rocks.summary.pending}, Average Progress: ${rocks.summary.avgProgressPct}%`
  );
  if (rocks.businessUnits.length) {
    lines.push("Per-Business-Unit Rocks:");
    for (const bu of rocks.businessUnits) {
      lines.push(
        `- ${bu.businessUnitName}: ${bu.total} total (${bu.targetMet} met, ${bu.onTrack} on track, ${bu.atRisk} at risk, ${bu.pending} pending), average progress ${bu.avgProgressPct}%`
      );
    }
  }
  if (rocks.attentionNeeded.length) {
    lines.push("Rocks needing attention (At Risk or Pending, lowest progress first):");
    for (const r of rocks.attentionNeeded) {
      lines.push(
        `- "${r.title}" (${r.companyName}, ${r.businessUnitName}) — ${r.status}, ${r.progressPct}% complete, owner: ${r.ownerName || "unassigned"}`
      );
    }
  }
  lines.push("");

  lines.push("=== DISBURSEMENTS ===");
  lines.push(
    `Advances: ${formatMoney(disbursements.summary.advancesActual)}, Loans: ${formatMoney(disbursements.summary.loansActual)}, Interests: ${formatMoney(
      disbursements.summary.interestsActual
    )}`
  );
  if (disbursements.businessUnits.length) {
    lines.push("Per-Business-Unit Disbursements:");
    for (const bu of disbursements.businessUnits) {
      lines.push(
        `- ${bu.businessUnitName}: Advances ${formatMoney(bu.advancesActual)}, Loans ${formatMoney(bu.loansActual)}, Interests ${formatMoney(bu.interestsActual)}`
      );
    }
  }
  lines.push("");

  lines.push("=== INSTRUCTIONS ===");
  lines.push(
    "Write a concise executive analysis of the period above — roughly 4 to 6 short paragraphs of plain prose (no markdown headers, no bullet lists, no bold text). Cover: (1) overall Revenue/Collections/Expenses attainment against target and what it signals; (2) Net Income and margin; (3) which Business Units are leading or lagging and why that matters; (4) Rocks (90-day priority) completion health and anything needing leadership attention; (5) notable Disbursement activity, if material; and (6) two or three specific, actionable recommendations for leadership. Cite figures using PHP currency formatting as given above. Write for a board-level audience — direct, specific, and free of filler."
  );

  return lines.join("\n");
}

/**
 * GET /api/ai-analysis
 * Query params: yearId (required), quarter (1-4, or "all"/omitted for the
 * full year), businessUnitId (optional drill-down) — identical contract to
 * GET /api/scorecard, since this reuses computeScorecard() for its data.
 * Generates fresh on every call (nothing is persisted/cached) — this is a
 * live call to Google's Gemini API using the key configured under
 * Admin -> AI Settings.
 */
router.get("/", async (req, res) => {
  const user = req.user!;
  const query = req.query as Record<string, string | undefined>;

  let data: Awaited<ReturnType<typeof computeScorecard>>;
  try {
    data = await computeScorecard(user, query);
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const settings = await prisma.aiSettings.findUnique({ where: { id: AI_SETTINGS_ID } });
  if (!settings?.apiKey) {
    return res.status(400).json({
      error: "The Gemini API key hasn't been configured yet. Ask a Superadmin to set it under Admin -> AI Settings.",
    });
  }

  const yearRow = await prisma.year.findUnique({ where: { id: query.yearId! }, select: { year: true } });
  const yearLabel = yearRow ? String(yearRow.year) : "Unknown Year";
  const periodLabel = data.scope.allQuarters ? "Full Year" : `Q${data.scope.quarter}`;
  const scopeLabel =
    data.revenue.businessUnits.length === 1 ? data.revenue.businessUnits[0].businessUnitName : "All Business Units in scope";

  const prompt = buildPrompt(data, yearLabel, periodLabel, scopeLabel);

  let analysis: string;
  try {
    analysis = await callGemini(settings.apiKey, settings.model, prompt);
  } catch (err: any) {
    return res.status(502).json({ error: err.message || "Failed to generate the analysis" });
  }

  await logAudit({
    user,
    action: "AI_ANALYSIS_GENERATE",
    entityType: "AiAnalysis",
    entityId: query.yearId!,
    summary: `Generated AI Analysis for ${yearLabel} ${periodLabel} (${scopeLabel})`,
    metadata: { yearId: query.yearId, quarter: data.scope.quarter, allQuarters: data.scope.allQuarters, businessUnitId: query.businessUnitId || null, model: settings.model, characterCount: analysis.length },
  });

  res.json({
    analysis,
    model: settings.model,
    generatedAt: new Date().toISOString(),
    scope: { ...data.scope, yearLabel, periodLabel, scopeLabel },
  });
});

export default router;
