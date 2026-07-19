-- Superadmin-authored free-text description per User, shown in the app
-- header in place of their role. Purely additive.
ALTER TABLE "User" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
