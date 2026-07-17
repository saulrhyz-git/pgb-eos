import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// This seed script is a hard reset back to a single account: the superadmin.
// It actively WIPES any Business Units, Companies, Years, targets, actuals,
// and any non-superadmin users before creating/keeping the superadmin — so
// running `npm run seed` always leaves the database with no sample/demo data,
// even if an earlier version of this script (or manual testing) already
// populated it. SMTP settings are left untouched since those are real config,
// not sample data.
async function main() {
  console.log("Resetting EOS dashboard database (wiping all data except the superadmin)...");

  await prisma.rock.deleteMany({});
  await prisma.goal.deleteMany({});
  await prisma.quarterActual.deleteMany({});
  await prisma.quarterTarget.deleteMany({});
  await prisma.annualTarget.deleteMany({});
  await prisma.userBusinessUnit.deleteMany({});
  await prisma.company.deleteMany({});
  await prisma.businessUnit.deleteMany({});
  await prisma.year.deleteMany({});
  await prisma.user.deleteMany({ where: { role: { not: "SUPERADMIN" } } });

  const superadminPasswordHash = await bcrypt.hash("0811837Sey@me7", 10);
  await prisma.user.upsert({
    where: { username: "saulrhyz" },
    update: {},
    create: {
      email: "saulrhyz@pgb-eos.local",
      username: "saulrhyz",
      name: "Saul Rhyz",
      role: "SUPERADMIN",
      passwordHash: superadminPasswordHash,
      mustChangePassword: true,
    },
  });

  console.log("Reset complete. No Business Units, Companies, Years, Goals, Rocks, or non-superadmin users remain.");
  console.log("");
  console.log("  Superadmin:  username 'saulrhyz' / password '0811837Sey@me7' (must change on first login)");
  console.log("");
  console.log("Log in as the superadmin, set a new password, then use the Admin console");
  console.log("to add Business Units, Companies, Years, and users.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
