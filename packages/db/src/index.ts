import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  });

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
export { prisma as db };
export default prisma;
