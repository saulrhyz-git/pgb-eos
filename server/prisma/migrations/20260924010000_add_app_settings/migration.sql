-- Singleton settings row for simple global feature toggles (currently just
-- niatEnabled) a Superadmin can flip without a deploy. No row is inserted
-- here — GET /api/app-settings falls back to each field's schema default
-- (niatEnabled = true) until the first PUT creates it, same pattern as
-- AiSettings/SmtpSettings.
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "niatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
