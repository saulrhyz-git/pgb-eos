-- Rock rollover tracking. A carried-forward copy now points back at the Rock
-- it was copied from (rolledFromId), and that original gets the new
-- ROLLED_OVER status. rolledFromId is UNIQUE so a Rock can only be rolled
-- forward once. The backfill for Rocks rolled over before this change lives
-- in the next migration, since a new enum value can't be used in the same
-- transaction that adds it.
ALTER TYPE "RockStatus" ADD VALUE 'ROLLED_OVER';

ALTER TABLE "Rock" ADD COLUMN "rolledFromId" TEXT;

CREATE UNIQUE INDEX "Rock_rolledFromId_key" ON "Rock"("rolledFromId");

ALTER TABLE "Rock" ADD CONSTRAINT "Rock_rolledFromId_fkey" FOREIGN KEY ("rolledFromId") REFERENCES "Rock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
