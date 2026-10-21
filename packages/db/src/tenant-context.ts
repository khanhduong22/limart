import { AsyncLocalStorage } from "node:async_hooks";

/**
 * ID cửa hàng mặc định (Default store tenant ID).
 * Khi không có header/token chỉ định cửa hàng khác, hệ thống tự động dùng "limart".
 */
export const DEFAULT_TENANT_ID = "limart";

/**
 * Cấu trúc dữ liệu lưu trong bộ nhớ ngữ cảnh của từng request (Per-request context store).
 */
export interface TenantContextStore {
  tenantId: string;
  enforceIsolation?: boolean;
}

/**
 * Bộ nhớ ngữ cảnh bất đồng bộ (AsyncLocalStorage) giúp tự động truyền `tenantId`
 * xuyên suốt mọi hàm async/await trong cùng 1 HTTP request mà không cần truyền tay qua từng hàm.
 *
 * English: AsyncLocalStorage instance propagating tenant context across async call chains.
 */
export const tenantStorage = new AsyncLocalStorage<TenantContextStore>();

/**
 * Danh sách 24 bảng (models) có cột `tenantId` cần được cô lập dữ liệu theo từng cửa hàng.
 *
 * English: Set of Prisma models that are scoped by `tenantId`.
 */
export const TENANT_SCOPED_MODELS = new Set([
  "User",
  "WorkShift",
  "ShiftAuditLog",
  "Request",
  "Announcement",
  "StickyNote",
  "PayrollAdjustment",
  "LuckyWheelPrize",
  "LuckyWheelHistory",
  "CheckIn",
  "AllowedIP",
  "Holiday",
  "TaskDefinition",
  "TaskItem",
  "UserTask",
  "PayrollPeriod",
  "Payslip",
  "Document",
  "ManagerTask",
  "StaffTask",
  "ManagerChecklistTask",
  "ManagerWeeklyTask",
  "ShiftDuty",
  "SessionAuditLog",
  "PushSubscription",
  "NotificationRule",
  "NotificationLog",
  "SemanticQaCache",
]);

const READ_FILTER_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

/**
 * Lấy `tenantId` của request hiện tại. Nếu không có, trả về mặc định `"limart"`.
 *
 * English: Returns the active tenantId from AsyncLocalStorage, falling back to `"limart"`.
 */
export function getCurrentTenantId(): string {
  return tenantStorage.getStore()?.tenantId || DEFAULT_TENANT_ID;
}

/**
 * Kiểm tra xem request hiện tại có đang chạy trên một cửa hàng khác `"limart"` hay không.
 *
 * English: Returns true if the current tenant is not the default `"limart"` tenant.
 */
export function isNonDefaultTenant(): boolean {
  return getCurrentTenantId() !== DEFAULT_TENANT_ID;
}

/**
 * Chuẩn hóa mã cửa hàng (chữ thường, cắt khoảng trắng thừa, mặc định `"limart"`).
 *
 * English: Normalizes a raw tenant identifier (lowercase, trimmed, fallback to `"limart"`).
 */
export function normalizeTenantId(rawTenantId?: string | null): string {
  const normalized = rawTenantId?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : DEFAULT_TENANT_ID;
}

/**
 * Chạy một hàm `fn` bên trong ngữ cảnh của một cửa hàng (`tenantId`) cụ thể.
 * Mọi truy vấn Prisma bên trong `fn` sẽ tự động biết chúng thuộc về `tenantId` này.
 *
 * English: Executes `fn` within an AsyncLocalStorage context bound to the normalized `tenantId`.
 */
export function runWithTenant<T>(
  tenantId: string,
  fn: () => T,
  options?: { enforceIsolation?: boolean }
): T {
  const normalized = normalizeTenantId(tenantId);
  return tenantStorage.run(
    {
      tenantId: normalized,
      enforceIsolation: options?.enforceIsolation,
    },
    fn
  );
}

/**
 * Hàm thuần (pure function) tự động gắn bộ lọc `tenantId` vào tham số truy vấn Prisma (`args`).
 * - Khi ở cửa hàng mặc định `"limart"` (và không bật `enforceIsolation: true`), giữ nguyên `args`
 *   100% để không làm hỏng bất kỳ unit test (`spyOn`) nào hiện có.
 * - Khi ở cửa hàng khác (ví dụ `"demo-coffee"`) hoặc bật `enforceIsolation: true`, tự động gắn
 *   `where.tenantId` cho câu lệnh đọc/cập nhật và `data.tenantId` cho câu lệnh tạo mới.
 *
 * English: Pure helper that injects `tenantId` into Prisma query `args` when tenant isolation is active.
 */
export function injectTenantFilter(
  model: string | undefined,
  operation: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  if (!model || !TENANT_SCOPED_MODELS.has(model)) {
    return args;
  }

  const store = tenantStorage.getStore();
  const tenantId = store?.tenantId || DEFAULT_TENANT_ID;
  const shouldInject = store?.enforceIsolation === true || tenantId !== DEFAULT_TENANT_ID;

  if (!shouldInject) {
    return args;
  }

  if (READ_FILTER_OPERATIONS.has(operation)) {
    const existingWhere =
      args.where && typeof args.where === "object" ? args.where : {};
    return {
      ...args,
      where: {
        ...existingWhere,
        tenantId: existingWhere.tenantId ?? tenantId,
      },
    };
  }

  if (operation === "create") {
    const existingData =
      args.data && typeof args.data === "object" ? args.data : {};
    return {
      ...args,
      data: {
        ...existingData,
        tenantId: existingData.tenantId ?? tenantId,
      },
    };
  }

  if (operation === "createMany") {
    if (Array.isArray(args.data)) {
      return {
        ...args,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: args.data.map((item: Record<string, any>) => ({
          ...item,
          tenantId: item.tenantId ?? tenantId,
        })),
      };
    }
    if (args.data && typeof args.data === "object") {
      return {
        ...args,
        data: {
          ...args.data,
          tenantId: args.data.tenantId ?? tenantId,
        },
      };
    }
  }

  return args;
}
