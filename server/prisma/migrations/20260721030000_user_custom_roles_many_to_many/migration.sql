-- A Superadmin can now assign any number of Custom Roles to the same User
-- (previously capped at one via User.customRoleId). Replaces that single
-- nullable FK with a join table, UserCustomRole, so a user's effective
-- permissions become the union of every assigned role's matrix (see
-- loadUserPermissions() in middleware/auth.ts). Existing single-role
-- assignments are carried forward into the join table before the old column
-- is dropped, so no user loses their currently-assigned role.

-- CreateTable
CREATE TABLE "UserCustomRole" (
    "userId" TEXT NOT NULL,
    "customRoleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCustomRole_pkey" PRIMARY KEY ("userId","customRoleId")
);

-- CreateIndex
CREATE INDEX "UserCustomRole_customRoleId_idx" ON "UserCustomRole"("customRoleId");

-- AddForeignKey
ALTER TABLE "UserCustomRole" ADD CONSTRAINT "UserCustomRole_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomRole" ADD CONSTRAINT "UserCustomRole_customRoleId_fkey"
    FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: carry forward every existing single-role assignment.
INSERT INTO "UserCustomRole" ("userId", "customRoleId", "createdAt")
SELECT "id", "customRoleId", CURRENT_TIMESTAMP FROM "User" WHERE "customRoleId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_customRoleId_fkey";

-- DropIndex
DROP INDEX "User_customRoleId_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "customRoleId";
