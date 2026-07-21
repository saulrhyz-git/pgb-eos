import { Router } from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { blockPendingPasswordChange, requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../utils/auditLog";
import { callGemini } from "../utils/gemini";

// SMTP configuration used to send email notifications, managed by the
// superadmin. Stored as a single row keyed by a fixed id so GET/PUT always
// operate on the same record.
const SMTP_SETTINGS_ID = "default";

const router = Router();
router.use(requireAuth);
router.use(blockPendingPasswordChange);
router.use(requireRole("SUPERADMIN"));

function serialize(settings: {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  fromAddress: string;
  fromName: string | null;
  updatedAt: Date;
} | null) {
  if (!settings) return null;
  return {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    username: settings.username,
    hasPassword: Boolean(settings.password),
    fromAddress: settings.fromAddress,
    fromName: settings.fromName,
    updatedAt: settings.updatedAt,
  };
}

router.get("/smtp", async (_req, res) => {
  const settings = await prisma.smtpSettings.findUnique({ where: { id: SMTP_SETTINGS_ID } });
  res.json(serialize(settings));
});

const smtpSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  username: z.string().optional().nullable(),
  // Optional: omit or leave blank to keep the currently stored password (e.g. when
  // editing other fields without re-entering credentials).
  password: z.string().optional(),
  fromAddress: z.string().email(),
  fromName: z.string().optional().nullable(),
});

router.put("/smtp", async (req, res) => {
  const parsed = smtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid SMTP settings", details: parsed.error.issues });

  const { host, port, secure, username, password, fromAddress, fromName } = parsed.data;
  const existing = await prisma.smtpSettings.findUnique({ where: { id: SMTP_SETTINGS_ID } });

  const settings = await prisma.smtpSettings.upsert({
    where: { id: SMTP_SETTINGS_ID },
    update: {
      host,
      port,
      secure,
      username: username ?? null,
      password: password ? password : existing?.password ?? null,
      fromAddress,
      fromName: fromName ?? null,
    },
    create: {
      id: SMTP_SETTINGS_ID,
      host,
      port,
      secure,
      username: username ?? null,
      password: password ?? null,
      fromAddress,
      fromName: fromName ?? null,
    },
  });
  // Never log the password value itself, just that settings were touched.
  await logAudit({
    user: req.user,
    action: "SMTP_SETTINGS_UPDATE",
    entityType: "SmtpSettings",
    entityId: settings.id,
    summary: `Updated SMTP settings (host: ${host})`,
    metadata: { host, port, secure, username: username ?? null, fromAddress, fromName: fromName ?? null, passwordChanged: Boolean(password) },
  });
  res.json(serialize(settings));
});

// ---------- AI Settings (Google Gemini, used by the AI Analysis feature) ----------
// Same singleton-row pattern as SMTP settings above. The API key is never
// echoed back to the frontend, only whether one is currently set
// (hasApiKey) — same treatment as SMTP's password. `model` is a plain
// free-text field (not an enum) since Gemini's available model names change
// over time; the frontend pre-fills it with a sensible current default but
// an admin can type any model string their API key has access to.
const AI_SETTINGS_ID = "default";

function serializeAi(settings: { apiKey: string | null; model: string; updatedAt: Date } | null) {
  if (!settings) return null;
  return {
    hasApiKey: Boolean(settings.apiKey),
    model: settings.model,
    updatedAt: settings.updatedAt,
  };
}

router.get("/ai", async (_req, res) => {
  const settings = await prisma.aiSettings.findUnique({ where: { id: AI_SETTINGS_ID } });
  res.json(serializeAi(settings));
});

const aiSettingsSchema = z.object({
  // Optional: omit or leave blank to keep the currently stored key (e.g.
  // when changing just the model without re-entering the key).
  apiKey: z.string().optional(),
  model: z.string().trim().min(1, "Model name is required"),
});

router.put("/ai", async (req, res) => {
  const parsed = aiSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid AI settings", details: parsed.error.issues });

  const { apiKey, model } = parsed.data;
  const existing = await prisma.aiSettings.findUnique({ where: { id: AI_SETTINGS_ID } });

  const settings = await prisma.aiSettings.upsert({
    where: { id: AI_SETTINGS_ID },
    update: { model, apiKey: apiKey ? apiKey : existing?.apiKey ?? null },
    create: { id: AI_SETTINGS_ID, model, apiKey: apiKey ?? null },
  });

  // Never log the API key value itself, just that settings were touched.
  await logAudit({
    user: req.user,
    action: "AI_SETTINGS_UPDATE",
    entityType: "AiSettings",
    entityId: settings.id,
    summary: `Updated AI Analysis settings (model: ${model})`,
    metadata: { model, apiKeyChanged: Boolean(apiKey) },
  });
  res.json(serializeAi(settings));
});

router.post("/ai/test", async (req, res) => {
  const settings = await prisma.aiSettings.findUnique({ where: { id: AI_SETTINGS_ID } });
  if (!settings?.apiKey) return res.status(400).json({ error: "An API key has not been configured yet — save one above first" });

  try {
    const reply = await callGemini(settings.apiKey, settings.model, 'Reply with exactly the single word "OK" and nothing else.');
    res.json({ ok: true, reply });
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to reach Gemini" });
  }
});

const testSchema = z.object({ to: z.string().email() });

router.post("/smtp/test", async (req, res) => {
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A valid 'to' address is required" });

  const settings = await prisma.smtpSettings.findUnique({ where: { id: SMTP_SETTINGS_ID } });
  if (!settings) return res.status(400).json({ error: "SMTP settings have not been configured yet" });

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.username ? { user: settings.username, pass: settings.password || "" } : undefined,
  });

  try {
    await transporter.sendMail({
      from: settings.fromName ? `"${settings.fromName}" <${settings.fromAddress}>` : settings.fromAddress,
      to: parsed.data.to,
      subject: "EOS Executive Dashboard - Test Email",
      text: "This is a test email confirming your SMTP settings are working correctly.",
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: `Failed to send test email: ${err.message || "unknown error"}` });
  }
});

export default router;
