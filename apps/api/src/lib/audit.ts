import { prisma } from "@checkin/db";
import { getRedisClient } from "./cache";
import {
  GENESIS_HASH,
  computeEntryHash,
  createAuditEntry,
  verifyChainIntegrity,
  canonicalJsonStringify,
  type AuditEntry,
  type IntegrityVerificationResult,
} from "@checkin/audit-trail";

export {
  GENESIS_HASH,
  computeEntryHash,
  createAuditEntry,
  verifyChainIntegrity,
  canonicalJsonStringify,
  type AuditEntry,
  type IntegrityVerificationResult,
};

export interface RecordSecureAuditLogParams {
  userId?: string | null;
  action: string;
  status?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  device?: string | null;
  city?: string | null;
  details?: Record<string, any> | null;
  requestId?: string | null;
}

/**
 * Retrieve the hash of the most recent SessionAuditLog entry.
 * If no previous log exists, or if previous logs lack a valid hash, returns GENESIS_HASH.
 */
export async function getPreviousAuditHash(): Promise<string> {
  try {
    const redis = getRedisClient();
    if (redis) {
      const cachedHash = await redis.get("audit:latest_hash").catch(() => null);
      if (cachedHash && typeof cachedHash === "string" && cachedHash.length === 64) {
        return cachedHash;
      }
    }

    if (typeof prisma?.sessionAuditLog?.findFirst === "function") {
      const lastLog = await prisma.sessionAuditLog.findFirst({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { details: true },
      });

      if (lastLog?.details && typeof lastLog.details === "object") {
        const details = lastLog.details as Record<string, any>;
        if (typeof details.hash === "string" && details.hash.length === 64) {
          return details.hash;
        }
      }
    }
  } catch (err) {
    console.warn(
      "[Audit Warning] Failed to fetch previous audit hash, falling back to GENESIS_HASH:",
      err
    );
  }
  return GENESIS_HASH;
}

/**
 * Record a tamper-evident audit log with SHA-256 hash chaining.
 * Attaches hash, previousHash, and requestId into the details JSON field of SessionAuditLog.
 */
export async function recordSecureAuditLog(params: RecordSecureAuditLogParams) {
  try {
    const {
      userId = null,
      action,
      status = "SUCCESS",
      ipAddress = null,
      userAgent = null,
      city = null,
    } = params;

    const device =
      params.device ||
      (userAgent && /Mobile|Android|iPhone|iPad/i.test(userAgent)
        ? "Mobile"
        : "Desktop");

    // Extract clean payload without existing crypto or timestamp markers
    const cleanPayload: Record<string, any> = {};
    if (params.details && typeof params.details === "object") {
      for (const [key, val] of Object.entries(params.details)) {
        if (key !== "hash" && key !== "previousHash" && key !== "timestamp") {
          cleanPayload[key] = val;
        }
      }
    }

    const effectiveRequestId =
      params.requestId || cleanPayload.requestId || null;
    cleanPayload.requestId = effectiveRequestId;

    const previousHash = await getPreviousAuditHash();
    const timestamp = Date.now();

    const auditEntry = createAuditEntry(
      {
        timestamp,
        actor: {
          userId: userId || "anonymous",
          role: "system",
          ipAddress: ipAddress || "127.0.0.1",
          userAgent: userAgent || "unknown",
          branchId: "default",
        },
        action,
        entityId: (cleanPayload.entityId as string) || userId || "system",
        payload: cleanPayload,
      },
      previousHash
    );

    const hash = auditEntry.currentHash;

    const enrichedDetails = {
      ...cleanPayload,
      timestamp,
      previousHash,
      hash,
    };

    const createdLog = await prisma.sessionAuditLog.create({
      data: {
        userId,
        action,
        status,
        ipAddress,
        userAgent,
        device,
        city,
        details: enrichedDetails,
      },
    });

    const redis = getRedisClient();
    if (redis) {
      await redis.set("audit:latest_hash", hash, "EX", 86400).catch(() => null);
    }

    return createdLog;
  } catch (err: any) {
    console.warn("[Audit Warning] Failed to record secure audit log:", err);
    return null;
  }
}

/**
 * Converts a database SessionAuditLog or mock into an AuditEntry for chain verification.
 */
export function sessionAuditLogToAuditEntry(log: {
  id?: string;
  userId?: string | null;
  action: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: any;
  createdAt?: Date | number;
}): AuditEntry {
  const details = (log.details as Record<string, any>) || {};
  const cleanPayload: Record<string, any> = {};
  for (const [key, val] of Object.entries(details)) {
    if (key !== "hash" && key !== "previousHash" && key !== "timestamp") {
      cleanPayload[key] = val;
    }
  }

  const entryTimestamp =
    typeof details.timestamp === "number"
      ? details.timestamp
      : log.createdAt instanceof Date
      ? log.createdAt.getTime()
      : typeof log.createdAt === "number"
      ? log.createdAt
      : 0;

  return {
    id: log.id || `audit_${Math.random()}`,
    timestamp: entryTimestamp,
    actor: {
      userId: log.userId || "anonymous",
      role: "system",
      ipAddress: log.ipAddress || "127.0.0.1",
      userAgent: log.userAgent || "unknown",
      branchId: "default",
    },
    action: log.action,
    entityId: (cleanPayload.entityId as string) || log.userId || "system",
    payload: cleanPayload,
    previousHash: details.previousHash || GENESIS_HASH,
    currentHash: details.hash || "",
    nonce: 0,
  };
}

/**
 * Verifies sequential cryptographic chain integrity and detects any tampering in an array of logs.
 */
export function verifySessionAuditChain(
  logs: Array<{
    id?: string;
    userId?: string | null;
    action: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    details?: any;
    createdAt?: Date | number;
  }>,
  expectedGenesisHash: string = GENESIS_HASH
): IntegrityVerificationResult {
  const entries = logs.map(sessionAuditLogToAuditEntry);
  return verifyChainIntegrity(entries, expectedGenesisHash);
}
