import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { blockPendingPasswordChange, requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../utils/auditLog";

// Singleton row (fixed id "default") of simple global feature toggles a
// Superadmin can flip without a deploy — see schema.prisma's AppSettings
// comment. Unlike settings.ts's SmtpSettings/AiSettings (Superadmin-only to
// even view, since they hold credentials), this is readable by ANY
// authenticated user — every user needs to know whether to show a feature,
// not just Superadmin — only the PUT below is Superadmin-gated.
const APP_SETTINGS_ID = "default";

const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);

router.get("/", async (_req, res) => {
  const settings = await prisma.appSettings.findUnique({ where: { id: APP_SETTINGS_ID } });
  // No row yet (nobody has touched a toggle since this table shipped) —
  // every flag's own schema default applies, same as once the row exists.
  res.json({ niatEnabled: settings?.niatEnabled ?? true });
});

const updateSchema = z.object({
  niatEnabled: z.boolean().optional(),
});

router.put("/", requireRole("SUPERADMIN"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid settings", details: parsed.error.issues });

  const settings = await prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    update: parsed.data.niatEnabled !== undefined ? { niatEnabled: parsed.data.niatEnabled } : {},
    create: { id: APP_SETTINGS_ID, niatEnabled: parsed.data.niatEnabled ?? true },
  });

  if (parsed.data.niatEnabled !== undefined) {
    await logAudit({
      user: req.user,
      action: "APP_SETTINGS_UPDATE",
      entityType: "AppSettings",
      entityId: settings.id,
      summary: `${parsed.data.niatEnabled ? "Enabled" : "Disabled"} the NIAT tab`,
    });
  }

  res.json({ niatEnabled: settings.niatEnabled });
});

export default router;
