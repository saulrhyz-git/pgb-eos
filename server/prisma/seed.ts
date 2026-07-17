import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Seeds only the account needed to bootstrap the system: the superadmin.
// No demo Business Units, Companies, Years, targets, actuals, or demo
// integrator accounts are created — the superadmin adds real data through
// the /admin console (and Target Setup) after logging in.
async function main() {
  console.log("Seeding EOS dashboard database...");

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

  console.log("Seed complete.");
  console.log("");
  console.log("  Superadmin:  username 'saulrhyz' / password '0811837Sey@me7' (must change on first login)");
  console.log("");
  console.log("No sample data was created. Log in as the superadmin, set a new password,");
  console.log("then use the Admin console to add Business Units, Companies, Years, and users.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
