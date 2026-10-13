import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSessionAuditLogCreate, mockSessionAuditLogFindFirst } = vi.hoisted(
  () => ({
    mockSessionAuditLogCreate: vi.fn(),
    mockSessionAuditLogFindFirst: vi.fn(),
  })
);

vi.mock("@checkin/db", () => ({
  prisma: {
    sessionAuditLog: {
      create: mockSessionAuditLogCreate,
      findFirst: mockSessionAuditLogFindFirst,
    },
  },
}));

import {
  recordSecureAuditLog,
  getPreviousAuditHash,
  sessionAuditLogToAuditEntry,
  verifySessionAuditChain,
  GENESIS_HASH,
  computeEntryHash,
  canonicalJsonStringify,
} from "../src/lib/audit";
import { setRedisClient } from "../src/lib/cache";

describe("Cryptographic Audit Trail Engine Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRedisClient(null);
  });

  describe("1. SHA-256 Hash Chaining Between Consecutive Logs", () => {
    it("anchors the first audit record to GENESIS_HASH when database is empty", async () => {
      mockSessionAuditLogFindFirst.mockResolvedValue(null);
      mockSessionAuditLogCreate.mockImplementation(async ({ data }) => ({
        id: "audit-001",
        ...data,
      }));

      const log = await recordSecureAuditLog({
        userId: "usr_100",
        action: "LOGIN",
        ipAddress: "192.168.1.50",
        userAgent: "Mozilla/5.0 (iPhone)",
        details: { attemptedEmail: "user1@example.com" },
        requestId: "req-genesis-1",
      });

      expect(log).not.toBeNull();
      expect(log?.details.previousHash).toBe(GENESIS_HASH);
      expect(typeof log?.details.hash).toBe("string");
      expect(log?.details.hash).toHaveLength(64);
      expect(log?.device).toBe("Mobile");
    });

    it("chains subsequent audit logs cryptographically using the previous log's SHA-256 hash", async () => {
      // Simulate 3 consecutive audit log writes in sequence
      const dbLogs: any[] = [];

      mockSessionAuditLogFindFirst.mockImplementation(async () => {
        if (dbLogs.length === 0) return null;
        return dbLogs[dbLogs.length - 1];
      });

      mockSessionAuditLogCreate.mockImplementation(async ({ data }) => {
        const entry = {
          id: `audit-${dbLogs.length + 1}`,
          ...data,
          createdAt: new Date(data.details.timestamp),
        };
        dbLogs.push(entry);
        return entry;
      });

      // Log 1: Login
      const log1 = await recordSecureAuditLog({
        userId: "usr_alice",
        action: "LOGIN",
        ipAddress: "14.161.20.10",
        userAgent: "Mozilla/5.0 Desktop",
        requestId: "req-step-1",
      });

      // Log 2: Check-in
      const log2 = await recordSecureAuditLog({
        userId: "usr_alice",
        action: "CHECKIN",
        ipAddress: "14.161.20.10",
        userAgent: "Mozilla/5.0 Desktop",
        details: { checkinId: "chk_001", isAllowedIP: true },
        requestId: "req-step-2",
      });

      // Log 3: Logout
      const log3 = await recordSecureAuditLog({
        userId: "usr_alice",
        action: "LOGOUT",
        ipAddress: "14.161.20.10",
        userAgent: "Mozilla/5.0 Desktop",
        requestId: "req-step-3",
      });

      expect(log1?.details.previousHash).toBe(GENESIS_HASH);
      expect(log2?.details.previousHash).toBe(log1?.details.hash);
      expect(log3?.details.previousHash).toBe(log2?.details.hash);

      // Verify the entire chain passes full cryptographic verification
      const verification = verifySessionAuditChain(dbLogs);
      expect(verification.isValid).toBe(true);
      expect(verification.totalRecords).toBe(3);
      expect(verification.tamperedIndex).toBeNull();
      expect(verification.tamperedRecordId).toBeNull();
    });
  });

  describe("2. Cryptographic Tamper Detection & Fraud Prevention", () => {
    it("fails integrity check when a log's action is maliciously altered", async () => {
      const dbLogs: any[] = [];
      mockSessionAuditLogFindFirst.mockImplementation(async () =>
        dbLogs.length === 0 ? null : dbLogs[dbLogs.length - 1]
      );
      mockSessionAuditLogCreate.mockImplementation(async ({ data }) => {
        const entry = {
          id: `audit-${dbLogs.length + 1}`,
          ...data,
          createdAt: new Date(data.details.timestamp),
        };
        dbLogs.push(entry);
        return entry;
      });

      await recordSecureAuditLog({
        userId: "usr_bob",
        action: "LOGIN",
        requestId: "req-01",
      });
      await recordSecureAuditLog({
        userId: "usr_bob",
        action: "CHECKIN",
        details: { checkinId: "chk_normal" },
        requestId: "req-02",
      });

      // Maliciously tamper with Log 2's action in database
      const tamperedLogs = JSON.parse(JSON.stringify(dbLogs));
      tamperedLogs[1].action = "ADMIN_ESCALATION";

      const result = verifySessionAuditChain(tamperedLogs);
      expect(result.isValid).toBe(false);
      expect(result.tamperedIndex).toBe(1);
      expect(result.tamperedRecordId).toBe("audit-2");
      expect(result.reason).toContain("Data tampering detected");
    });

    it("fails integrity check when payload details are modified", async () => {
      const dbLogs: any[] = [];
      mockSessionAuditLogFindFirst.mockImplementation(async () =>
        dbLogs.length === 0 ? null : dbLogs[dbLogs.length - 1]
      );
      mockSessionAuditLogCreate.mockImplementation(async ({ data }) => {
        const entry = {
          id: `audit-${dbLogs.length + 1}`,
          ...data,
          createdAt: new Date(data.details.timestamp),
        };
        dbLogs.push(entry);
        return entry;
      });

      await recordSecureAuditLog({
        userId: "usr_charlie",
        action: "MANUAL_CHECKIN",
        details: { targetUserId: "usr_worker", checkInTime: "08:00" },
        requestId: "req-audit-man",
      });

      // Tamper with checkInTime inside details
      const tamperedLogs = JSON.parse(JSON.stringify(dbLogs));
      tamperedLogs[0].details.checkInTime = "07:30"; // falsified time

      const result = verifySessionAuditChain(tamperedLogs);
      expect(result.isValid).toBe(false);
      expect(result.tamperedIndex).toBe(0);
      expect(result.reason).toContain("Data tampering detected");
    });

    it("fails integrity check when a record is deleted or inserted out of order (broken link)", async () => {
      const dbLogs: any[] = [];
      mockSessionAuditLogFindFirst.mockImplementation(async () =>
        dbLogs.length === 0 ? null : dbLogs[dbLogs.length - 1]
      );
      mockSessionAuditLogCreate.mockImplementation(async ({ data }) => {
        const entry = {
          id: `audit-${dbLogs.length + 1}`,
          ...data,
          createdAt: new Date(data.details.timestamp),
        };
        dbLogs.push(entry);
        return entry;
      });

      await recordSecureAuditLog({ userId: "u1", action: "LOGIN", requestId: "r1" });
      await recordSecureAuditLog({ userId: "u1", action: "CHECKIN", requestId: "r2" });
      await recordSecureAuditLog({ userId: "u1", action: "LOGOUT", requestId: "r3" });

      // Malicious actor drops intermediate checkin record
      const truncatedChain = [dbLogs[0], dbLogs[2]];

      const result = verifySessionAuditChain(truncatedChain);
      expect(result.isValid).toBe(false);
      expect(result.tamperedIndex).toBe(1);
      expect(result.reason).toContain("Broken chain link detected");
    });
  });

  describe("3. Request ID Correlation & Anonymity Handling", () => {
    it("attaches requestId into details and binds it to cryptographic signature", async () => {
      mockSessionAuditLogFindFirst.mockResolvedValue(null);
      mockSessionAuditLogCreate.mockImplementation(async ({ data }) => ({
        id: "audit-req-test",
        ...data,
      }));

      const testRequestId = "req-trace-uuid-9999";
      const log = await recordSecureAuditLog({
        userId: "usr_dan",
        action: "LOGIN",
        details: { note: "Login from new browser" },
        requestId: testRequestId,
      });

      expect(log?.details.requestId).toBe(testRequestId);

      // Altering only the requestId must break the cryptographic hash
      const fakeLog = {
        ...log,
        details: {
          ...log.details,
          requestId: "req-spoofed-trace",
        },
      };

      const result = verifySessionAuditChain([fakeLog]);
      expect(result.isValid).toBe(false);
      expect(result.tamperedIndex).toBe(0);
    });

    it("handles anonymous/failed logins where userId is null without errors", async () => {
      mockSessionAuditLogFindFirst.mockResolvedValue(null);
      mockSessionAuditLogCreate.mockImplementation(async ({ data }) => ({
        id: "audit-anon",
        ...data,
      }));

      const log = await recordSecureAuditLog({
        userId: null,
        action: "LOGIN",
        status: "FAILED",
        ipAddress: "103.20.14.5",
        userAgent: "curl/8.1.0",
        details: { reason: "User not found or invalid credentials" },
        requestId: "req-anon-attack",
      });

      expect(log).not.toBeNull();
      expect(log?.userId).toBeNull();
      expect(log?.status).toBe("FAILED");
      expect(log?.details.previousHash).toBe(GENESIS_HASH);
      expect(log?.details.hash).toHaveLength(64);

      const entry = sessionAuditLogToAuditEntry(log);
      expect(entry.actor.userId).toBe("anonymous");
      expect(verifySessionAuditChain([log]).isValid).toBe(true);
    });
  });

  describe("4. Valkey Fast-Path Caching for Audit Hash", () => {
    it("uses cached hash from Valkey without querying database findFirst", async () => {
      const cachedHash = "a".repeat(64);
      const mockRedis = {
        get: vi.fn().mockResolvedValue(cachedHash),
        set: vi.fn().mockResolvedValue("OK"),
      } as any;
      setRedisClient(mockRedis);

      const hash = await getPreviousAuditHash();

      expect(hash).toBe(cachedHash);
      expect(mockRedis.get).toHaveBeenCalledWith("audit:latest_hash");
      expect(mockSessionAuditLogFindFirst).not.toHaveBeenCalled();
    });

    it("falls back to database findFirst if Valkey returns null (cache miss)", async () => {
      const dbHash = "b".repeat(64);
      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
      } as any;
      setRedisClient(mockRedis);

      mockSessionAuditLogFindFirst.mockResolvedValue({
        details: { hash: dbHash },
      });

      const hash = await getPreviousAuditHash();

      expect(hash).toBe(dbHash);
      expect(mockRedis.get).toHaveBeenCalledWith("audit:latest_hash");
      expect(mockSessionAuditLogFindFirst).toHaveBeenCalled();
    });

    it("falls back to database findFirst if Valkey returns an invalid or non-64-char hash", async () => {
      const dbHash = "c".repeat(64);
      const mockRedis = {
        get: vi.fn().mockResolvedValue("too-short-hash"),
        set: vi.fn().mockResolvedValue("OK"),
      } as any;
      setRedisClient(mockRedis);

      mockSessionAuditLogFindFirst.mockResolvedValue({
        details: { hash: dbHash },
      });

      const hash = await getPreviousAuditHash();

      expect(hash).toBe(dbHash);
      expect(mockRedis.get).toHaveBeenCalledWith("audit:latest_hash");
      expect(mockSessionAuditLogFindFirst).toHaveBeenCalled();
    });

    it("falls back to database findFirst if Valkey get throws an error", async () => {
      const dbHash = "d".repeat(64);
      const mockRedis = {
        get: vi.fn().mockRejectedValue(new Error("Valkey timeout")),
        set: vi.fn().mockResolvedValue("OK"),
      } as any;
      setRedisClient(mockRedis);

      mockSessionAuditLogFindFirst.mockResolvedValue({
        details: { hash: dbHash },
      });

      const hash = await getPreviousAuditHash();

      expect(hash).toBe(dbHash);
      expect(mockSessionAuditLogFindFirst).toHaveBeenCalled();
    });

    it("writes computed hash to Valkey with 24h TTL upon recordSecureAuditLog", async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
      } as any;
      setRedisClient(mockRedis);

      mockSessionAuditLogFindFirst.mockResolvedValue(null);
      mockSessionAuditLogCreate.mockImplementation(async ({ data }) => ({
        id: "audit-valkey-success",
        ...data,
      }));

      const log = await recordSecureAuditLog({
        userId: "usr_valkey_write",
        action: "STORE_AUDIT",
        requestId: "req-valkey-write-1",
      });

      expect(log).not.toBeNull();
      const generatedHash = log?.details.hash;
      expect(generatedHash).toHaveLength(64);
      expect(mockRedis.set).toHaveBeenCalledWith(
        "audit:latest_hash",
        generatedHash,
        "EX",
        86400
      );
    });

    it("continues successfully even if Valkey set rejects with an error", async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockRejectedValue(new Error("Valkey write error")),
      } as any;
      setRedisClient(mockRedis);

      mockSessionAuditLogFindFirst.mockResolvedValue(null);
      mockSessionAuditLogCreate.mockImplementation(async ({ data }) => ({
        id: "audit-valkey-resilience",
        ...data,
      }));

      const log = await recordSecureAuditLog({
        userId: "usr_resilience",
        action: "TEST_RESILIENCE",
        requestId: "req-resilience-1",
      });

      expect(log).not.toBeNull();
      expect(log?.id).toBe("audit-valkey-resilience");
      expect(log?.details.hash).toHaveLength(64);
    });
  });
});

