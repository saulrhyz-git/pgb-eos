-- Manual, admin-controlled lock on a Year+Quarter's Targets (Group
-- Integrator / Superadmin only), layered on top of the existing
-- calendar-based lock. See the TargetLock model comment in schema.prisma.
CREATE TABLE "TargetLock" (
    "id" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "lockedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TargetLock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TargetLock_yearId_quarter_key" ON "TargetLock"("yearId", "quarter");

ALTER TABLE "TargetLock" ADD CONSTRAINT "TargetLock_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TargetLock" ADD CONSTRAINT "TargetLock_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
