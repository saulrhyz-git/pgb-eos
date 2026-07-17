-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'GROUP_INTEGRATOR', 'BU_INTEGRATOR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmtpSettings" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "password" TEXT,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmtpSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBusinessUnit" (
    "userId" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,

    CONSTRAINT "UserBusinessUnit_pkey" PRIMARY KEY ("userId","businessUnitId")
);

-- CreateTable
CREATE TABLE "BusinessUnit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Year" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualTarget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "revenueInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "revenueExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expensesInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expensesExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuarterTarget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "revenueInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "revenueExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expensesInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expensesExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuarterTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuarterActual" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "revenueInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "revenueExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionsExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expensesInternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expensesExternal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuarterActual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "UserBusinessUnit_businessUnitId_idx" ON "UserBusinessUnit"("businessUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUnit_name_key" ON "BusinessUnit"("name");

-- CreateIndex
CREATE INDEX "Company_businessUnitId_idx" ON "Company"("businessUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_businessUnitId_name_key" ON "Company"("businessUnitId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Year_year_key" ON "Year"("year");

-- CreateIndex
CREATE INDEX "AnnualTarget_yearId_idx" ON "AnnualTarget"("yearId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualTarget_companyId_yearId_key" ON "AnnualTarget"("companyId", "yearId");

-- CreateIndex
CREATE INDEX "QuarterTarget_yearId_quarter_idx" ON "QuarterTarget"("yearId", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "QuarterTarget_companyId_yearId_quarter_key" ON "QuarterTarget"("companyId", "yearId", "quarter");

-- CreateIndex
CREATE INDEX "QuarterActual_yearId_quarter_idx" ON "QuarterActual"("yearId", "quarter");

-- CreateIndex
CREATE INDEX "QuarterActual_companyId_idx" ON "QuarterActual"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "QuarterActual_companyId_yearId_quarter_key" ON "QuarterActual"("companyId", "yearId", "quarter");

-- AddForeignKey
ALTER TABLE "UserBusinessUnit" ADD CONSTRAINT "UserBusinessUnit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBusinessUnit" ADD CONSTRAINT "UserBusinessUnit_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualTarget" ADD CONSTRAINT "AnnualTarget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualTarget" ADD CONSTRAINT "AnnualTarget_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterTarget" ADD CONSTRAINT "QuarterTarget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterTarget" ADD CONSTRAINT "QuarterTarget_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterActual" ADD CONSTRAINT "QuarterActual_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterActual" ADD CONSTRAINT "QuarterActual_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuarterActual" ADD CONSTRAINT "QuarterActual_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
