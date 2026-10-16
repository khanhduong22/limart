import { PrismaClient } from "@prisma/client";
import {
  injectTenantFilter,
  isNonDefaultTenant,
  tenantStorage,
} from "./tenant-context";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  tenantMiddlewareRegistered: boolean | undefined;
};

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  });

if (
  !globalForPrisma.tenantMiddlewareRegistered &&
  typeof prisma.$use === "function"
) {
  prisma.$use(async (params, next) => {
    if (
      isNonDefaultTenant() ||
      tenantStorage.getStore()?.enforceIsolation === true
    ) {
      params.args = injectTenantFilter(
        params.model,
        params.action,
        params.args ?? {}
      );
    }
    return next(params);
  });
  globalForPrisma.tenantMiddlewareRegistered = true;
}

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
export * from "./tenant-context";
export { prisma as db };
export default prisma;
