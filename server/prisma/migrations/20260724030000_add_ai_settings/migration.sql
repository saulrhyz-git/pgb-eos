-- CreateTable
-- AiSettings: singleton row (fixed id "default", same convention as
-- SmtpSettings) holding the Google Gemini API key + model name used by the
-- AI Analysis feature. Managed by SUPERADMIN only via server/src/routes/
-- settings.ts.
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL,
    "apiKey" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);
