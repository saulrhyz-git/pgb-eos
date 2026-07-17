import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Deterministic PRNG so re-running the seed produces the same "realistic" numbers.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20250101);
const between = (min: number, max: number) => min + rand() * (max - min);
const round2 = (v: number) => Math.round(v * 100) / 100;

const BUSINESS_UNITS: Record<string, string[]> = {
  "Professional Services": ["Vantage Consulting", "Brightline Advisors", "Northbeam Partners", "Clearpath Solutions"],
  Manufacturing: ["Ironclad Fabrication", "Summit Metalworks", "Redline Industrial"],
  Technology: ["Datastream Systems", "Nimbus Cloud Co", "Pixel Forge Labs", "Circuit & Sage"],
};

// Split a total into internal/external using a per-company internal ratio.
function split(total: number, internalRatio: number) {
  const internal = round2(total * internalRatio);
  const external = round2(total - internal);
  return { internal, external };
}

async function main() {
  console.log("Seeding EOS dashboard database...");

  // ---------- Users ----------
  const passwordHash = await bcrypt.hash("password123", 10);

  const groupIntegrator = await prisma.user.upsert({
    where: { email: "group.integrator@pgb.com" },
    update: {},
    create: {
      email: "group.integrator@pgb.com",
      name: "Grace Holloway",
      role: "GROUP_INTEGRATOR",
      passwordHash,
    },
  });

  const buUserDefs = [
    { email: "bu.services@pgb.com", name: "Sam Rivera", bus: ["Professional Services"] },
    { email: "bu.manufacturing@pgb.com", name: "Dana Whitfield", bus: ["Manufacturing"] },
    { email: "bu.tech@pgb.com", name: "Priya Nandakumar", bus: ["Technology"] },
    { email: "bu.multi@pgb.com", name: "Jordan Ellis", bus: ["Manufacturing", "Technology"] },
  ];

  // ---------- Business Units + Companies ----------
  const buRecords: Record<string, { id: string }> = {};
  for (const name of Object.keys(BUSINESS_UNITS)) {
    const bu = await prisma.businessUnit.upsert({ where: { name }, update: {}, create: { name } });
    buRecords[name] = bu;
  }

  for (const def of buUserDefs) {
    const user = await prisma.user.upsert({
      where: { email: def.email },
      update: {},
      create: { email: def.email, name: def.name, role: "BU_INTEGRATOR", passwordHash },
    });
    for (const buName of def.bus) {
      await prisma.userBusinessUnit.upsert({
        where: { userId_businessUnitId: { userId: user.id, businessUnitId: buRecords[buName].id } },
        update: {},
        create: { userId: user.id, businessUnitId: buRecords[buName].id },
      });
    }
  }

  const companyRecords: Array<{ id: string; name: string; businessUnitId: string; internalRatio: number; baseAnnualRevenue: number }> = [];
  for (const [buName, companies] of Object.entries(BUSINESS_UNITS)) {
    for (const companyName of companies) {
      const company = await prisma.company.upsert({
        where: { businessUnitId_name: { businessUnitId: buRecords[buName].id, name: companyName } },
        update: {},
        create: { name: companyName, businessUnitId: buRecords[buName].id },
      });
      companyRecords.push({
        id: company.id,
        name: company.name,
        businessUnitId: buRecords[buName].id,
        internalRatio: between(0.35, 0.65),
        baseAnnualRevenue: between(900_000, 3_200_000),
      });
    }
  }

  // ---------- Years ----------
  const years = [2025, 2026];
  const yearRecords: Record<number, { id: string }> = {};
  for (const y of years) {
    yearRecords[y] = await prisma.year.upsert({ where: { year: y }, update: {}, create: { year: y } });
  }

  // Quarter weighting so targets aren't flat (EOS businesses often ramp toward Q4).
  const quarterWeights = [0.22, 0.24, 0.25, 0.29];

  for (const company of companyRecords) {
    for (const [yearIdx, year] of years.entries()) {
      // Modest year-over-year growth in the target.
      const annualRevenueTarget = round2(company.baseAnnualRevenue * (1 + yearIdx * between(0.06, 0.14)));
      const annualCollectionsTarget = round2(annualRevenueTarget * between(0.9, 0.98));
      const annualExpensesTarget = round2(annualRevenueTarget * between(0.6, 0.8));

      const revSplit = split(annualRevenueTarget, company.internalRatio);
      const collSplit = split(annualCollectionsTarget, company.internalRatio);
      const expSplit = split(annualExpensesTarget, company.internalRatio);

      await prisma.annualTarget.upsert({
        where: { companyId_yearId: { companyId: company.id, yearId: yearRecords[year].id } },
        update: {},
        create: {
          companyId: company.id,
          yearId: yearRecords[year].id,
          revenueInternal: revSplit.internal,
          revenueExternal: revSplit.external,
          collectionsInternal: collSplit.internal,
          collectionsExternal: collSplit.external,
          expensesInternal: expSplit.internal,
          expensesExternal: expSplit.external,
        },
      });

      const isCurrentYear = year === years[years.length - 1];
      // For the most recent year, only fill actuals through Q2 (in-progress cycle);
      // prior year gets a full Q1-Q4 actuals history.
      const actualsThroughQuarter = isCurrentYear ? 2 : 4;

      for (let q = 1; q <= 4; q++) {
        const weight = quarterWeights[q - 1];
        const qRevenueTarget = round2(annualRevenueTarget * weight);
        const qCollectionsTarget = round2(annualCollectionsTarget * weight);
        const qExpensesTarget = round2(annualExpensesTarget * weight);

        const qRevSplit = split(qRevenueTarget, company.internalRatio);
        const qCollSplit = split(qCollectionsTarget, company.internalRatio);
        const qExpSplit = split(qExpensesTarget, company.internalRatio);

        await prisma.quarterTarget.upsert({
          where: { companyId_yearId_quarter: { companyId: company.id, yearId: yearRecords[year].id, quarter: q } },
          update: {},
          create: {
            companyId: company.id,
            yearId: yearRecords[year].id,
            quarter: q,
            revenueInternal: qRevSplit.internal,
            revenueExternal: qRevSplit.external,
            collectionsInternal: qCollSplit.internal,
            collectionsExternal: qCollSplit.external,
            expensesInternal: qExpSplit.internal,
            expensesExternal: qExpSplit.external,
          },
        });

        if (q <= actualsThroughQuarter) {
          // Attainment variance: some quarters beat target (green), some miss (red).
          const performance = between(0.82, 1.18);
          const aRevenueTotal = round2(qRevenueTarget * performance);
          const aCollectionsTotal = round2(qCollectionsTarget * between(0.85, 1.1));
          const aExpensesTotal = round2(qExpensesTarget * between(0.9, 1.15));

          const aRevSplit = split(aRevenueTotal, company.internalRatio + between(-0.05, 0.05));
          const aCollSplit = split(aCollectionsTotal, company.internalRatio);
          const aExpSplit = split(aExpensesTotal, company.internalRatio);

          const remarksPool = [
            "On track, no blockers this quarter.",
            "Slower start due to key hire ramp-up; expect catch-up next quarter.",
            "Strong external pipeline closed ahead of schedule.",
            "Collections lagging invoicing; following up with AR team.",
            "Expense overrun tied to one-time equipment purchase.",
            "",
          ];
          const remarks = remarksPool[Math.floor(between(0, remarksPool.length))];

          await prisma.quarterActual.upsert({
            where: { companyId_yearId_quarter: { companyId: company.id, yearId: yearRecords[year].id, quarter: q } },
            update: {},
            create: {
              companyId: company.id,
              yearId: yearRecords[year].id,
              quarter: q,
              revenueInternal: aRevSplit.internal,
              revenueExternal: aRevSplit.external,
              collectionsInternal: aCollSplit.internal,
              collectionsExternal: aCollSplit.external,
              expensesInternal: aExpSplit.internal,
              expensesExternal: aExpSplit.external,
              remarks,
            },
          });
        }
      }
    }
  }

  console.log("Seed complete.");
  console.log("");
  console.log("Login credentials (all use password: password123):");
  console.log("  Group Integrator:      group.integrator@pgb.com");
  console.log("  BU Integrator (Svc):   bu.services@pgb.com       -> Professional Services");
  console.log("  BU Integrator (Mfg):   bu.manufacturing@pgb.com  -> Manufacturing");
  console.log("  BU Integrator (Tech):  bu.tech@pgb.com           -> Technology");
  console.log("  BU Integrator (Multi): bu.multi@pgb.com          -> Manufacturing + Technology");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
