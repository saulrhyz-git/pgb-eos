-- Login lockout: track consecutive invalid-password attempts per User and
-- the timestamp their account is locked until (NULL when not locked).
-- Purely additive; every existing row defaults to 0 attempts / no lock.
ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);
