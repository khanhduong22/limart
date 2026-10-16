import {
  createCipheriv,
  createECDH,
  createHash,
  createPrivateKey,
  createSign,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { prisma } from "@checkin/db";

export type ShiftTriggerType = "BEFORE_SHIFT_START" | "BEFORE_SHIFT_END";

export interface ShiftNotificationRule {
  id: string;
  code: string;
  name: string;
  triggerType: ShiftTriggerType;
  offsetMinutes: number;
  titleTemplate: string;
  bodyTemplate: string;
  targetUrl: string;
  active: boolean;
  enabled: boolean;
}

export interface VapidKeyConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface WebPushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface WebPushResult {
  success: boolean;
  statusCode?: number;
  isExpired?: boolean;
  error?: string;
}

function toBase64Url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(base64Url: string): Buffer {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

function createDeterministicDefaultVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH("prime256v1");
  const seed = createHash("sha256")
    .update("limart-checkin-default-vapid-seed-2026-p256")
    .digest();
  ecdh.setPrivateKey(seed);
  return {
    publicKey: toBase64Url(ecdh.getPublicKey()),
    privateKey: toBase64Url(ecdh.getPrivateKey()),
  };
}

export const DEFAULT_VAPID_KEYS = createDeterministicDefaultVapidKeys();

export function getVapidConfig(): VapidKeyConfig {
  return {
    publicKey: process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_KEYS.publicKey,
    privateKey: process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_KEYS.privateKey,
    subject: process.env.VAPID_SUBJECT || "mailto:admin@limart.vn",
  };
}

export function getVapidPublicKey(): string {
  return getVapidConfig().publicKey;
}

export const DEFAULT_SHIFT_NOTIFICATION_RULES: ShiftNotificationRule[] = [
  {
    id: "SHIFT_START_30M",
    code: "SHIFT_START_30M",
    name: "Nhắc trước 30 phút khi vào ca",
    triggerType: "BEFORE_SHIFT_START",
    offsetMinutes: 30,
    active: true,
    enabled: true,
    titleTemplate: "⏰ Sắp vào ca làm việc (còn 30 phút)",
    bodyTemplate:
      "Chào {name}, ca trực hôm nay ({shiftTime}) của bạn sẽ bắt đầu sau 30 phút nữa. Chuẩn bị lên đường nhé!",
    targetUrl: "/",
  },
  {
    id: "SHIFT_START_15M",
    code: "SHIFT_START_15M",
    name: "Nhắc trước 15 phút khi vào ca",
    triggerType: "BEFORE_SHIFT_START",
    offsetMinutes: 15,
    active: true,
    enabled: true,
    titleTemplate: "🚀 Chuẩn bị Check-in vào ca (còn 15 phút)",
    bodyTemplate:
      "Chào {name}, chỉ còn 15 phút nữa là tới giờ vào ca ({shiftTime}). Nhớ kết nối WiFi cửa hàng và bấm Check-in đúng giờ nhé!",
    targetUrl: "/",
  },
  {
    id: "SHIFT_END_30M",
    code: "SHIFT_END_30M",
    name: "Nhắc trước 30 phút khi tan ca",
    triggerType: "BEFORE_SHIFT_END",
    offsetMinutes: 30,
    active: true,
    enabled: true,
    titleTemplate: "📋 Sắp kết thúc ca trực (còn 30 phút)",
    bodyTemplate:
      "Chào {name}, còn 30 phút nữa là hết ca ({shiftTime}). Hãy kiểm tra lại checklist công việc trong ca và chuẩn bị bàn giao nhé!",
    targetUrl: "/",
  },
  {
    id: "SHIFT_END_15M",
    code: "SHIFT_END_15M",
    name: "Nhắc trước 15 phút khi tan ca",
    triggerType: "BEFORE_SHIFT_END",
    offsetMinutes: 15,
    active: true,
    enabled: true,
    titleTemplate: "🏁 Chuẩn bị Tan ca & Check-out (còn 15 phút)",
    bodyTemplate:
      "Chào {name}, còn 15 phút nữa là tan ca ({shiftTime}). Đừng quên hoàn tất công việc và bấm Check-out trước khi ra về nhé!",
    targetUrl: "/",
  },
];

// In-memory state fallbacks when DB tables are not migrated or partially mocked in unit tests
let inMemoryRules: ShiftNotificationRule[] = DEFAULT_SHIFT_NOTIFICATION_RULES.map((r) => ({
  ...r,
}));
const dispatchedShiftRuleKeys = new Set<string>();

export function resetShiftNotificationMemoryState(): void {
  inMemoryRules = DEFAULT_SHIFT_NOTIFICATION_RULES.map((r) => ({ ...r }));
  dispatchedShiftRuleKeys.clear();
}

export function getInMemoryRules(): ShiftNotificationRule[] {
  return inMemoryRules;
}

export function setInMemoryRules(rules: ShiftNotificationRule[]): void {
  inMemoryRules = rules;
}

export function normalizeNotificationRule(raw: any): ShiftNotificationRule {
  const active = Boolean(raw?.active ?? raw?.enabled ?? true);
  const code = String(raw?.code || raw?.id || "CUSTOM_RULE");
  return {
    id: String(raw?.id || code),
    code,
    name: String(raw?.name || "Nhắc ca trực"),
    triggerType:
      raw?.triggerType === "BEFORE_SHIFT_END" ? "BEFORE_SHIFT_END" : "BEFORE_SHIFT_START",
    offsetMinutes: Number(raw?.offsetMinutes ?? 15),
    titleTemplate: String(raw?.titleTemplate || ""),
    bodyTemplate: String(raw?.bodyTemplate || ""),
    targetUrl: String(raw?.targetUrl || "/"),
    active,
    enabled: active,
  };
}

/**
 * Safely checks if `prisma.notificationRule` exists and seeds any missing default rules
 * from the 4 default shift reminder rules (with an in-memory fallback array if the DB table
 * isn't migrated yet or isn't mocked in a unit test).
 */
export async function ensureDefaultNotificationRules(): Promise<ShiftNotificationRule[]> {
  const ruleModel = (prisma as any)?.notificationRule;
  if (!ruleModel || typeof ruleModel.findMany !== "function") {
    return inMemoryRules.map((r) => ({ ...r }));
  }

  try {
    const existingRaw = await ruleModel.findMany({
      orderBy: [{ triggerType: "asc" }, { offsetMinutes: "desc" }],
    });

    if (!Array.isArray(existingRaw)) {
      return inMemoryRules.map((r) => ({ ...r }));
    }

    const byCode = new Map<string, ShiftNotificationRule>();
    for (const item of existingRaw) {
      const normalized = normalizeNotificationRule(item);
      byCode.set(normalized.code, normalized);
    }

    for (const def of DEFAULT_SHIFT_NOTIFICATION_RULES) {
      if (!byCode.has(def.code)) {
        try {
          if (typeof ruleModel.upsert === "function") {
            const upserted = await ruleModel.upsert({
              where: { code: def.code },
              update: {},
              create: {
                code: def.code,
                name: def.name,
                triggerType: def.triggerType,
                offsetMinutes: def.offsetMinutes,
                titleTemplate: def.titleTemplate,
                bodyTemplate: def.bodyTemplate,
                targetUrl: def.targetUrl,
                active: def.active,
              },
            });
            byCode.set(def.code, normalizeNotificationRule(upserted || def));
          } else if (typeof ruleModel.create === "function") {
            const created = await ruleModel.create({
              data: {
                code: def.code,
                name: def.name,
                triggerType: def.triggerType,
                offsetMinutes: def.offsetMinutes,
                titleTemplate: def.titleTemplate,
                bodyTemplate: def.bodyTemplate,
                targetUrl: def.targetUrl,
                active: def.active,
              },
            });
            byCode.set(def.code, normalizeNotificationRule(created || def));
          } else {
            byCode.set(def.code, { ...def });
          }
        } catch {
          byCode.set(def.code, { ...def });
        }
      }
    }

    const result = Array.from(byCode.values());
    inMemoryRules = result.map((r) => ({ ...r }));
    return result;
  } catch {
    return inMemoryRules.map((r) => ({ ...r }));
  }
}

/**
 * Formats a Date into `HH:mm` in `Asia/Ho_Chi_Minh` timezone (UTC+7).
 */
export function formatVietnamHHmm(dateInput: Date | string): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const vnTime = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const hours = String(vnTime.getUTCHours()).padStart(2, "0");
  const minutes = String(vnTime.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Formats `HH:mm - HH:mm` in `Asia/Ho_Chi_Minh` timezone (e.g. `"08:00 - 12:00"`).
 */
export function formatShiftTimeRange(start: Date | string, end: Date | string): string {
  return `${formatVietnamHHmm(start)} - ${formatVietnamHHmm(end)}`;
}

/**
 * Replaces `{name}`, `{shiftTime}`, `{offsetMinutes}` placeholders in a notification template.
 */
export function renderNotificationTemplate(
  template: string,
  vars: { name: string; shiftTime: string; offsetMinutes: number }
): string {
  return String(template || "")
    .replace(/\{name\}/g, vars.name || "Bạn")
    .replace(/\{shiftTime\}/g, vars.shiftTime || "")
    .replace(/\{offsetMinutes\}/g, String(vars.offsetMinutes ?? 0));
}

function buildVapidJwtFallback(audience: string, vapid: VapidKeyConfig): string {
  const pub = fromBase64Url(vapid.publicKey);
  const priv = fromBase64Url(vapid.privateKey);
  const keyObject = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: toBase64Url(pub.subarray(1, 33)),
      y: toBase64Url(pub.subarray(33, 65)),
      d: toBase64Url(priv),
    },
    format: "jwk",
  });

  const header = toBase64Url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" }), "utf8"));
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const payload = toBase64Url(
    Buffer.from(JSON.stringify({ aud: audience, exp, sub: vapid.subject }), "utf8")
  );
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign({ key: keyObject, dsaEncoding: "ieee-p1363" });
  return `${unsignedToken}.${toBase64Url(signature)}`;
}

function encryptPayloadFallback(
  payloadString: string,
  p256dhBase64Url: string,
  authBase64Url: string
): Buffer {
  const uaPublic = fromBase64Url(p256dhBase64Url);
  const authSecret = fromBase64Url(authBase64Url);
  const localEcdh = createECDH("prime256v1");
  localEcdh.generateKeys();
  const asPublic = localEcdh.getPublicKey();
  const sharedSecret = localEcdh.computeSecret(uaPublic);
  const salt = randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "ascii"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));
  const cekInfo = Buffer.from("Content-Encoding: aes128gcm\0", "ascii");
  const nonceInfo = Buffer.from("Content-Encoding: nonce\0", "ascii");
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, cekInfo, 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, nonceInfo, 12));

  const plaintext = Buffer.from(payloadString, "utf8");
  const paddedPlaintext = Buffer.concat([plaintext, Buffer.from([0x02])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(paddedPlaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const header = Buffer.alloc(16 + 4 + 1 + asPublic.length);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  asPublic.copy(header, 21);

  return Buffer.concat([header, ciphertext]);
}

async function sendWebPushFallback(
  subscription: WebPushSubscriptionInput,
  payload: Record<string, unknown>,
  vapid: VapidKeyConfig
): Promise<WebPushResult> {
  try {
    const parsedUrl = new URL(subscription.endpoint);
    const audience = `${parsedUrl.protocol}//${parsedUrl.host}`;
    const jwt = buildVapidJwtFallback(audience, vapid);
    const encryptedBody = encryptPayloadFallback(
      JSON.stringify(payload),
      subscription.keys.p256dh,
      subscription.keys.auth
    );

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
        TTL: "86400",
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "Content-Length": String(encryptedBody.byteLength),
      },
      body: new Uint8Array(encryptedBody),
    });

    if (res.status >= 200 && res.status < 300) {
      return { success: true, statusCode: res.status, isExpired: false };
    }
    return {
      success: false,
      statusCode: res.status,
      isExpired: res.status === 410 || res.status === 404,
      error: `HTTP ${res.status}`,
    };
  } catch (err: any) {
    const statusCode = err?.statusCode ?? err?.status;
    return {
      success: false,
      statusCode,
      isExpired: statusCode === 410 || statusCode === 404,
      error: err?.message || String(err),
    };
  }
}

async function dispatchSingleWebPush(
  subscription: WebPushSubscriptionInput,
  payload: Record<string, unknown>,
  vapid: VapidKeyConfig
): Promise<WebPushResult> {
  try {
    const notifyModulePath = "../../../../packages/notify/src";
    const notifyMod = await import(/* @vite-ignore */ notifyModulePath).catch(() => null);
    if (notifyMod && typeof notifyMod.sendWebPush === "function") {
      return await notifyMod.sendWebPush(subscription, payload, vapid);
    }
  } catch {
    // Fallback to built-in Web Push sender
  }
  return await sendWebPushFallback(subscription, payload, vapid);
}

/**
 * Sends a notification to a specific user across all their registered Web Push subscriptions
 * and records an entry in `prisma.notificationLog`.
 */
export async function sendNotificationToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    url?: string;
    shiftId?: number;
    ruleCode?: string;
    channel?: string;
  }
): Promise<{ deliveredDevices: number; logged: boolean }> {
  const vapid = getVapidConfig();
  const targetUrl = payload.url || "/";
  const channel = payload.channel || "WEB_PUSH";

  let subscriptions: any[] = [];
  const subModel = (prisma as any)?.pushSubscription;
  if (subModel && typeof subModel.findMany === "function") {
    try {
      const found = await subModel.findMany({ where: { userId } });
      if (Array.isArray(found)) {
        subscriptions = found;
      }
    } catch {
      subscriptions = [];
    }
  }

  let deliveredDevices = 0;

  for (const sub of subscriptions) {
    const endpoint = sub?.endpoint;
    if (!endpoint) continue;

    const p256dh = sub?.p256dh || sub?.keys?.p256dh || "";
    const auth = sub?.auth || sub?.keys?.auth || "";

    const res = await dispatchSingleWebPush(
      {
        endpoint,
        keys: { p256dh, auth },
      },
      {
        title: payload.title,
        body: payload.body,
        url: targetUrl,
        shiftId: payload.shiftId,
        ruleCode: payload.ruleCode,
        timestamp: new Date().toISOString(),
      },
      vapid
    );

    if (res?.isExpired || res?.statusCode === 410 || res?.statusCode === 404) {
      if (subModel && typeof subModel.delete === "function") {
        try {
          await subModel.delete({ where: { endpoint } });
        } catch {
          // Ignore delete errors if already removed
        }
      }
    } else if (res?.success) {
      deliveredDevices++;
    }
  }

  const logModel = (prisma as any)?.notificationLog;
  if (logModel && typeof logModel.create === "function") {
    try {
      await logModel.create({
        data: {
          userId,
          shiftId: payload.shiftId ?? null,
          ruleCode: payload.ruleCode ?? null,
          title: payload.title,
          body: payload.body,
          targetUrl,
          channel,
          deliveredCount: deliveredDevices,
        },
      });
    } catch {
      // Never fail if notificationLog is mocked or unavailable
    }
  }

  return {
    deliveredDevices,
    logged: true,
  };
}

/**
 * Computes start (`00:00:00.000` ICT) and end (`23:59:59.999` ICT) of today in Vietnam timezone (`UTC+7`),
 * along with the `YYYY-MM-DD` date key in ICT.
 */
export function getVietnamTodayRange(now: Date = new Date()): {
  dayKey: string;
  startOfDay: Date;
  endOfDay: Date;
} {
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const vnNow = new Date(now.getTime() + vnOffsetMs);
  const year = vnNow.getUTCFullYear();
  const month = String(vnNow.getUTCMonth() + 1).padStart(2, "0");
  const day = String(vnNow.getUTCDate()).padStart(2, "0");
  const dayKey = `${year}-${month}-${day}`;

  const startOfDay = new Date(`${dayKey}T00:00:00.000+07:00`);
  const endOfDay = new Date(`${dayKey}T23:59:59.999+07:00`);

  return { dayKey, startOfDay, endOfDay };
}

/**
 * Evaluates today's `APPROVED` shifts in Vietnam time (`UTC+7`) against active `NotificationRule`s.
 *
 * - In automatic scheduler mode, triggers when `now` is within ±2 minutes of
 *   `offsetMinutes` before `shift.start` (`BEFORE_SHIFT_START`) or `shift.end` (`BEFORE_SHIFT_END`).
 * - Prevents duplicate sends for the same `(shift.id, rule.code)` on the same day using both
 *   an in-memory `Set<string>` and `prisma.notificationLog.findFirst`.
 */
export async function runShiftReminderCheck(options?: {
  now?: Date;
  forceRuleCode?: string;
  forceAllToday?: boolean;
}): Promise<{
  checkedShifts: number;
  matchedReminders: number;
  notifications: Array<{
    shiftId: number;
    userId: string;
    userName: string;
    ruleCode: string;
    title: string;
    body: string;
    shiftTime: string;
    deliveredDevices: number;
  }>;
}> {
  const now = options?.now ? new Date(options.now) : new Date();
  const { dayKey, startOfDay, endOfDay } = getVietnamTodayRange(now);

  let shifts: any[] = [];
  if (prisma?.workShift?.findMany) {
    try {
      const found = await prisma.workShift.findMany({
        where: {
          status: "APPROVED",
          start: { lte: endOfDay },
          end: { gte: startOfDay },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              isActive: true,
            },
          },
        },
        orderBy: { start: "asc" },
      });
      if (Array.isArray(found)) {
        shifts = found;
      }
    } catch {
      shifts = [];
    }
  }

  const allRules = await ensureDefaultNotificationRules();
  const activeRules = options?.forceRuleCode
    ? allRules.filter((r) => r.code === options.forceRuleCode)
    : allRules.filter((r) => r.active);

  const sentList: Array<{
    shiftId: number;
    userId: string;
    userName: string;
    ruleCode: string;
    title: string;
    body: string;
    shiftTime: string;
    deliveredDevices: number;
  }> = [];

  const logModel = (prisma as any)?.notificationLog;

  for (const shift of shifts) {
    if (!shift || shift.user?.isActive === false) {
      continue;
    }

    const userId = String(shift.userId || shift.user?.id || "");
    if (!userId) continue;

    const userName = String(shift.user?.name || shift.user?.email || "Bạn");
    const shiftStart = new Date(shift.start);
    const shiftEnd = new Date(shift.end);
    const shiftTime = formatShiftTimeRange(shiftStart, shiftEnd);

    for (const rule of activeRules) {
      let isMatch = false;

      if (options?.forceRuleCode) {
        isMatch = rule.code === options.forceRuleCode;
      } else if (options?.forceAllToday) {
        isMatch = true;
      } else {
        const targetMoment =
          rule.triggerType === "BEFORE_SHIFT_END" ? shiftEnd : shiftStart;
        const diffMinutes = Math.round((targetMoment.getTime() - now.getTime()) / 60000);
        if (Math.abs(diffMinutes - rule.offsetMinutes) <= 2) {
          isMatch = true;
        }
      }

      if (!isMatch) continue;

      // Check idempotency in automatic scheduler mode so the same (shift.id, rule.code) is never sent twice
      const idempotencyKey = `${dayKey}:${shift.id}:${rule.code}`;
      if (!options?.forceRuleCode && !options?.forceAllToday) {
        if (dispatchedShiftRuleKeys.has(idempotencyKey)) {
          continue;
        }

        if (logModel && typeof logModel.findFirst === "function") {
          try {
            const existingLog = await logModel.findFirst({
              where: {
                shiftId: shift.id,
                ruleCode: rule.code,
              },
            });
            if (existingLog) {
              dispatchedShiftRuleKeys.add(idempotencyKey);
              continue;
            }
          } catch {
            // Continue if notificationLog.findFirst is not mocked
          }
        }
      }

      const title = renderNotificationTemplate(rule.titleTemplate, {
        name: userName,
        shiftTime,
        offsetMinutes: rule.offsetMinutes,
      });
      const body = renderNotificationTemplate(rule.bodyTemplate, {
        name: userName,
        shiftTime,
        offsetMinutes: rule.offsetMinutes,
      });

      dispatchedShiftRuleKeys.add(idempotencyKey);

      const sendRes = await sendNotificationToUser(userId, {
        title,
        body,
        url: rule.targetUrl || "/",
        shiftId: shift.id,
        ruleCode: rule.code,
        channel: "WEB_PUSH",
      });

      sentList.push({
        shiftId: shift.id,
        userId,
        userName,
        ruleCode: rule.code,
        title,
        body,
        shiftTime,
        deliveredDevices: sendRes.deliveredDevices,
      });
    }
  }

  return {
    checkedShifts: shifts.length,
    matchedReminders: sentList.length,
    notifications: sentList,
  };
}
