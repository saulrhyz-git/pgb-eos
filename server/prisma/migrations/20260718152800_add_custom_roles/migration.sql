-- Custom Roles: superadmin-authored permission profiles assignable to Users
-- in addition to their base Role. Each CustomRole owns a matrix of
-- RolePermission rows — one per (Business Unit or Company) x resource
-- (Targets/Revenue/Collections/Expenses/Rocks), each with independent
-- View/Edit/Delete flags. Purely additive: no existing table is touched, and
-- every existing User keeps customRoleId = NULL (unaffected, same behavior
-- as before).

CREATE TYPE "PermissionResource" AS ENUM ('TARGETS', 'REVENUE', 'COLLECTIONS', 'EXPENSES', 'ROCKS');

CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomRole_name_key" ON "CustomRole"("name");

CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "customRoleId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "companyId" TEXT,
    "resource" "PermissionResource" NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RolePermission_customRoleId_idx" ON "RolePermission"("customRoleId");
CREATE INDEX "RolePermission_businessUnitId_idx" ON "RolePermission"("businessUnitId");
CREATE INDEX "RolePermission_companyId_idx" ON "RolePermission"("companyId");

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_customRoleId_fkey"
    FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_businessUnitId_fkey"
    FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "customRoleId" TEXT;
CREATE INDEX "User_customRoleId_idx" ON "User"("customRoleId");
ALTER TABLE "User" ADD CONSTRAINT "User_customRoleId_fkey"
    FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
