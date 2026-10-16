import { createHash } from "node:crypto";
import { prisma } from "@checkin/db";
import { invalidateCachePattern } from "./cache";
import { DEFAULT_TENANT_ID, runWithTenant } from "../middleware/tenant.middleware";

export type TenantBackupScope = "all" | "schedule" | "documents" | "tasks" | "holidays";

export const VALID_BACKUP_SCOPES: readonly TenantBackupScope[] = [
  "all",
  "schedule",
  "documents",
  "tasks",
  "holidays",
] as const;

export interface TenantSnapshotPayload {
  version: "1.0";
  exportedAt: string;
  tenantId: string;
  scope: TenantBackupScope;
  counts: Record<string, number>;
  checksum: string;
  data: {
    tenant: Record<string, any>;
    users: Record<string, any>[];
    workShifts?: Record<string, any>[];
    shiftDuties?: Record<string, any>[];
    documents?: Record<string, any>[];
    announcements?: Record<string, any>[];
    taskDefinitions?: Record<string, any>[];
    taskItems?: Record<string, any>[];
    managerChecklistTasks?: Record<string, any>[];
    managerWeeklyTasks?: Record<string, any>[];
    holidays?: Record<string, any>[];
    allowedIps?: Record<string, any>[];
  };
}

export function computeSnapshotChecksum(data: unknown): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

async function safeFindMany(
  model: any,
  tenantId: string,
  extraArgs: Record<string, any> = {}
): Promise<any[]> {
  if (!model || typeof model.findMany !== "function") {
    return [];
  }
  try {
    const rows = await model.findMany({
      ...extraArgs,
      where: { ...(extraArgs.where || {}), tenantId },
    });
    return Array.isArray(rows) ? rows : [];
  } catch {
    try {
      const fallbackRows = await model.findMany(extraArgs);
      if (!Array.isArray(fallbackRows)) return [];
      return fallbackRows.filter(
        (r: any) => !r?.tenantId || r.tenantId === tenantId || (tenantId === DEFAULT_TENANT_ID && !r?.tenantId)
      );
    } catch {
      return [];
    }
  }
}

export async function exportTenantSnapshot(
  rawTenantId: string = DEFAULT_TENANT_ID,
  scope: TenantBackupScope = "all"
): Promise<TenantSnapshotPayload> {
  const tenantId = (rawTenantId || DEFAULT_TENANT_ID).trim().toLowerCase();
  const normalizedScope: TenantBackupScope = VALID_BACKUP_SCOPES.includes(scope) ? scope : "all";

  return runWithTenant(tenantId, async () => {
    const db = prisma as Record<string, any>;

    let tenantMeta: Record<string, any> | null = null;
    if (db.tenant && typeof db.tenant.findUnique === "function") {
      try {
        tenantMeta = await db.tenant.findUnique({ where: { id: tenantId } });
      } catch {
        tenantMeta = null;
      }
    }
    if (!tenantMeta) {
      tenantMeta = {
        id: tenantId,
        slug: tenantId,
        name:
          tenantId === "limart"
            ? "LimArt Flagship Store"
            : tenantId === "demo"
              ? "LimArt Demo Sandbox"
              : `Cửa hàng ${tenantId}`,
        isActive: true,
      };
    }

    const users = await safeFindMany(db.user, tenantId, {
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        employmentType: true,
        hourlyRate: true,
        monthlySalary: true,
        isActive: true,
        tenantId: true,
      },
    });

    const data: TenantSnapshotPayload["data"] = {
      tenant: tenantMeta,
      users: users.map((u) => ({ ...u, tenantId: u.tenantId || tenantId })),
    };

    const counts: Record<string, number> = {
      users: data.users.length,
    };

    if (normalizedScope === "all" || normalizedScope === "schedule") {
      const [workShifts, shiftDuties] = await Promise.all([
        safeFindMany(db.workShift, tenantId),
        safeFindMany(db.shiftDuty, tenantId),
      ]);
      data.workShifts = workShifts;
      data.shiftDuties = shiftDuties;
      counts.workShifts = workShifts.length;
      counts.shiftDuties = shiftDuties.length;
    }

    if (normalizedScope === "all" || normalizedScope === "documents") {
      const [documents, announcements] = await Promise.all([
        safeFindMany(db.document, tenantId),
        safeFindMany(db.announcement, tenantId),
      ]);
      data.documents = documents;
      data.announcements = announcements;
      counts.documents = documents.length;
      counts.announcements = announcements.length;
    }

    if (normalizedScope === "all" || normalizedScope === "tasks") {
      const [taskDefinitions, taskItems, managerChecklistTasks, managerWeeklyTasks] =
        await Promise.all([
          safeFindMany(db.taskDefinition, tenantId),
          safeFindMany(db.taskItem, tenantId),
          safeFindMany(db.managerChecklistTask, tenantId),
          safeFindMany(db.managerWeeklyTasks || db.managerWeeklyTask, tenantId),
        ]);
      data.taskDefinitions = taskDefinitions;
      data.taskItems = taskItems;
      data.managerChecklistTasks = managerChecklistTasks;
      data.managerWeeklyTasks = managerWeeklyTasks;
      counts.taskDefinitions = taskDefinitions.length;
      counts.taskItems = taskItems.length;
      counts.managerChecklistTasks = managerChecklistTasks.length;
      counts.managerWeeklyTasks = managerWeeklyTasks.length;
    }

    if (normalizedScope === "all" || normalizedScope === "holidays") {
      const [holidays, allowedIps] = await Promise.all([
        safeFindMany(db.holiday, tenantId),
        safeFindMany(db.allowedIP, tenantId),
      ]);
      data.holidays = holidays;
      data.allowedIps = allowedIps;
      counts.holidays = holidays.length;
      counts.allowedIps = allowedIps.length;
    }

    const checksum = computeSnapshotChecksum(data);

    return {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      tenantId,
      scope: normalizedScope,
      counts,
      checksum,
      data,
    };
  });
}

async function restoreCollection(
  model: any,
  records: Record<string, any>[] | undefined,
  targetTenantId: string,
  sourceTenantId: string,
  options: { numericId?: boolean } = {}
): Promise<number> {
  if (!Array.isArray(records) || records.length === 0 || !model) {
    return 0;
  }

  let restored = 0;
  const isCrossTenantClone = targetTenantId !== sourceTenantId;

  for (const rawItem of records) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item: Record<string, any> = { ...rawItem, tenantId: targetTenantId };

    if (options.numericId) {
      if (isCrossTenantClone) {
        delete item.id;
      }
      if (!isCrossTenantClone && item.id !== undefined && typeof model.upsert === "function") {
        await model.upsert({
          where: { id: item.id },
          update: item,
          create: item,
        });
        restored++;
        continue;
      }
      if (typeof model.create === "function") {
        const createPayload = { ...item };
        if (isCrossTenantClone) {
          delete createPayload.id;
        }
        await model.create({ data: createPayload });
        restored++;
      }
      continue;
    }

    if (isCrossTenantClone && typeof item.id === "string" && !item.id.startsWith(`${targetTenantId}_`)) {
      item.id = `${targetTenantId}_${item.id}`;
    }

    if (item.id && typeof model.upsert === "function") {
      await model.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
      restored++;
    } else if (typeof model.create === "function") {
      await model.create({ data: item });
      restored++;
    }
  }

  return restored;
}

export async function restoreTenantSnapshot(
  snapshot: any,
  options?: { targetTenantId?: string; scopes?: string[] }
): Promise<{
  restoredTenantId: string;
  scope: string;
  restoredCounts: Record<string, number>;
}> {
  if (!snapshot || typeof snapshot !== "object" || snapshot.version !== "1.0" || !snapshot.data) {
    throw new Error("Định dạng file backup không hợp lệ (Yêu cầu snapshot version 1.0)");
  }

  const expectedChecksum = computeSnapshotChecksum(snapshot.data);
  if (!snapshot.checksum || snapshot.checksum !== expectedChecksum) {
    throw new Error(
      "Chữ ký SHA-256 của file backup không khớp (File có thể đã bị chỉnh sửa hoặc hỏng)"
    );
  }

  const sourceTenantId = (snapshot.tenantId || DEFAULT_TENANT_ID).trim().toLowerCase();
  const targetTenantId = (options?.targetTenantId || sourceTenantId || DEFAULT_TENANT_ID)
    .trim()
    .toLowerCase();
  const activeScopes = options?.scopes?.length
    ? options.scopes
    : [snapshot.scope || "all"];

  const shouldRestoreScope = (s: TenantBackupScope) =>
    activeScopes.includes("all") || activeScopes.includes(s);

  const restoredCounts: Record<string, number> = {};

  await runWithTenant(targetTenantId, async () => {
    const executeRestore = async (tx: Record<string, any>) => {
      if (tx.tenant && typeof tx.tenant.upsert === "function") {
        const tenantData = snapshot.data.tenant || {};
        await tx.tenant
          .upsert({
            where: { id: targetTenantId },
            update: {
              name: tenantData.name || `Cửa hàng ${targetTenantId}`,
              isActive: tenantData.isActive ?? true,
            },
            create: {
              id: targetTenantId,
              slug: targetTenantId,
              name: tenantData.name || `Cửa hàng ${targetTenantId}`,
              isActive: tenantData.isActive ?? true,
            },
          })
          .catch(() => null);
      }

      if (shouldRestoreScope("holidays")) {
        restoredCounts.holidays = await restoreCollection(
          tx.holiday,
          snapshot.data.holidays,
          targetTenantId,
          sourceTenantId
        );
        restoredCounts.allowedIps = await restoreCollection(
          tx.allowedIP,
          snapshot.data.allowedIps,
          targetTenantId,
          sourceTenantId,
          { numericId: true }
        );
      }

      if (shouldRestoreScope("documents")) {
        restoredCounts.documents = await restoreCollection(
          tx.document,
          snapshot.data.documents,
          targetTenantId,
          sourceTenantId
        );
        restoredCounts.announcements = await restoreCollection(
          tx.announcement,
          snapshot.data.announcements,
          targetTenantId,
          sourceTenantId
        );
      }

      if (shouldRestoreScope("tasks")) {
        restoredCounts.taskDefinitions = await restoreCollection(
          tx.taskDefinition,
          snapshot.data.taskDefinitions,
          targetTenantId,
          sourceTenantId
        );
        restoredCounts.taskItems = await restoreCollection(
          tx.taskItem,
          snapshot.data.taskItems,
          targetTenantId,
          sourceTenantId
        );
        restoredCounts.managerChecklistTasks = await restoreCollection(
          tx.managerChecklistTask,
          snapshot.data.managerChecklistTasks,
          targetTenantId,
          sourceTenantId
        );
        restoredCounts.managerWeeklyTasks = await restoreCollection(
          tx.managerWeeklyTask,
          snapshot.data.managerWeeklyTasks,
          targetTenantId,
          sourceTenantId
        );
      }

      if (shouldRestoreScope("schedule")) {
        restoredCounts.workShifts = await restoreCollection(
          tx.workShift,
          snapshot.data.workShifts,
          targetTenantId,
          sourceTenantId,
          { numericId: true }
        );
        restoredCounts.shiftDuties = await restoreCollection(
          tx.shiftDuty,
          snapshot.data.shiftDuties,
          targetTenantId,
          sourceTenantId
        );
      }
    };

    const db = prisma as Record<string, any>;
    if (typeof db.$transaction === "function") {
      await db.$transaction(async (tx: Record<string, any>) => {
        await executeRestore(tx || db);
      });
    } else {
      await executeRestore(db);
    }

    await invalidateCachePattern("*");
  });

  return {
    restoredTenantId: targetTenantId,
    scope: snapshot.scope || "all",
    restoredCounts,
  };
}
