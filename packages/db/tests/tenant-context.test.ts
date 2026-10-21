import { describe, expect, it } from "bun:test";
import {
  DEFAULT_TENANT_ID,
  TENANT_SCOPED_MODELS,
  getCurrentTenantId,
  injectTenantFilter,
  isNonDefaultTenant,
  normalizeTenantId,
  runWithTenant,
} from "../src/tenant-context";

describe("Multi-Tenant AsyncLocalStorage Context & Filter Injection", () => {
  it("returns default tenant 'limart' when outside runWithTenant", () => {
    expect(getCurrentTenantId()).toBe(DEFAULT_TENANT_ID);
    expect(isNonDefaultTenant()).toBe(false);
  });

  it("normalizes tenant IDs (lowercase, trimmed, fallback to limart)", () => {
    expect(normalizeTenantId("  COFFEE-House  ")).toBe("coffee-house");
    expect(normalizeTenantId("")).toBe("limart");
    expect(normalizeTenantId("   ")).toBe("limart");
    expect(normalizeTenantId(null)).toBe("limart");
    expect(normalizeTenantId(undefined)).toBe("limart");
  });

  it("propagates tenantId across nested async calls and concurrent promises", async () => {
    const results = await Promise.all([
      runWithTenant("Store-Alpha", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const inner = await (async () => getCurrentTenantId())();
        return { current: getCurrentTenantId(), inner, nonDefault: isNonDefaultTenant() };
      }),
      runWithTenant("Store-Beta", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { current: getCurrentTenantId(), nonDefault: isNonDefaultTenant() };
      }),
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { current: getCurrentTenantId(), nonDefault: isNonDefaultTenant() };
      })(),
    ]);

    expect(results[0]).toEqual({
      current: "store-alpha",
      inner: "store-alpha",
      nonDefault: true,
    });
    expect(results[1]).toEqual({
      current: "store-beta",
      nonDefault: true,
    });
    expect(results[2]).toEqual({
      current: "limart",
      nonDefault: false,
    });
  });

  it("leaves args untouched on default tenant 'limart' when enforceIsolation is not set", () => {
    const originalArgs = { where: { isActive: true } };
    const result = injectTenantFilter("User", "findMany", originalArgs);
    expect(result).toBe(originalArgs);
    expect(result).toEqual({ where: { isActive: true } });
  });

  it("injects tenantId on default tenant 'limart' when enforceIsolation is true", () => {
    runWithTenant(
      "limart",
      () => {
        const result = injectTenantFilter("User", "findMany", {
          where: { isActive: true },
        });
        expect(result).toEqual({
          where: { isActive: true, tenantId: "limart" },
        });
      },
      { enforceIsolation: true }
    );
  });

  it("injects tenantId across read and write operations for non-default tenants", () => {
    runWithTenant("boba-shop", () => {
      expect(
        injectTenantFilter("User", "findMany", { where: { role: "USER" } })
      ).toEqual({
        where: { role: "USER", tenantId: "boba-shop" },
      });

      expect(injectTenantFilter("WorkShift", "count", {})).toEqual({
        where: { tenantId: "boba-shop" },
      });

      expect(
        injectTenantFilter("Request", "updateMany", {
          where: { status: "PENDING" },
          data: { status: "APPROVED" },
        })
      ).toEqual({
        where: { status: "PENDING", tenantId: "boba-shop" },
        data: { status: "APPROVED" },
      });

      expect(
        injectTenantFilter("CheckIn", "create", {
          data: { userId: "u1", type: "CHECKIN", ipAddress: "1.1.1.1" },
        })
      ).toEqual({
        data: {
          userId: "u1",
          type: "CHECKIN",
          ipAddress: "1.1.1.1",
          tenantId: "boba-shop",
        },
      });

      expect(
        injectTenantFilter("Holiday", "createMany", {
          data: [
            { name: "Tet", date: new Date("2026-01-01") },
            { name: "National Day", date: new Date("2026-09-02"), tenantId: "custom-tenant" },
          ],
        })
      ).toEqual({
        data: [
          { name: "Tet", date: new Date("2026-01-01"), tenantId: "boba-shop" },
          { name: "National Day", date: new Date("2026-09-02"), tenantId: "custom-tenant" },
        ],
      });
    });
  });

  it("does not modify non-scoped models like Account, Session, or Tenant", () => {
    runWithTenant("boba-shop", () => {
      const accountArgs = { where: { userId: "u1" } };
      expect(injectTenantFilter("Account", "findMany", accountArgs)).toBe(
        accountArgs
      );
      expect(injectTenantFilter("Tenant", "findFirst", accountArgs)).toBe(
        accountArgs
      );
      expect(injectTenantFilter(undefined, "findMany", accountArgs)).toBe(
        accountArgs
      );
    });
  });

  it("includes all 28 tenant-scoped models in TENANT_SCOPED_MODELS", () => {
    expect(TENANT_SCOPED_MODELS.size).toBe(28);
    expect(TENANT_SCOPED_MODELS.has("User")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("WorkShift")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("SessionAuditLog")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("PushSubscription")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("NotificationRule")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("NotificationLog")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("SemanticQaCache")).toBe(true);
  });
});
