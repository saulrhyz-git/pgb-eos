import { PrismaClient } from "@prisma/client";

// Single shared Prisma instance.
export const prisma = new PrismaClient();
