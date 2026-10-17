import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAllowedIPFindMany } = vi.hoisted(() => ({
  mockAllowedIPFindMany: vi.fn(),
}));

vi.mock("@checkin/db", () => ({
  prisma: {
    allowedIP: {
      findMany: mockAllowedIPFindMany,
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../src/lib/cache", () => ({
  checkCacheHealth: vi.fn().mockResolvedValue("connected"),
  getOrSetCache: vi.fn().mockImplementation((_k, _t, fn) => fn()),
}));

vi.mock("../src/lib/meilisearch", () => ({
  checkMeiliHealth: vi.fn().mockResolvedValue("connected"),
}));

vi.mock("../src/lib/special-days", () => ({
  getSpecialDays: vi.fn().mockResolvedValue([
    { date: "2026-10-20", title: "Phụ nữ Việt Nam" }
  ]),
}));

import { app } from "../src/app";

describe("ETag Middleware & HTTP Response Optimization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates an ETag header on GET response", async () => {
    const res = await app.request("/api/special-days");

    expect(res.status).toBe(200);
    const etag = res.headers.get("ETag");
    expect(etag).toBeDefined();
    expect(etag).toMatch(/^"[a-f0-9]+"$/);
  });

  it("returns HTTP 304 Not Modified with empty body when If-None-Match matches ETag", async () => {
    // 1. Initial request to fetch data and obtain ETag
    const firstRes = await app.request("/api/special-days");

    expect(firstRes.status).toBe(200);
    const etag = firstRes.headers.get("ETag");
    expect(etag).toBeTruthy();

    // 2. Subsequent request sending If-None-Match header
    const cachedRes = await app.request("/api/special-days", {
      headers: {
        "If-None-Match": etag!,
      },
    });

    expect(cachedRes.status).toBe(304);
    expect(cachedRes.headers.get("ETag")).toBe(etag);
    const bodyText = await cachedRes.text();
    expect(bodyText).toBe("");
  });

  it("returns HTTP 304 Not Modified when If-None-Match is '*'", async () => {
    const res = await app.request("/api/special-days", {
      headers: {
        "If-None-Match": "*",
      },
    });

    expect(res.status).toBe(304);
    const bodyText = await res.text();
    expect(bodyText).toBe("");
  });

  it("returns HTTP 200 with full payload when If-None-Match does not match", async () => {
    const res = await app.request("/api/special-days", {
      headers: {
        "If-None-Match": '"outdated-or-different-etag-hash"',
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("preserves GET /health functionality with ETag header", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toBeDefined();

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.db).toBe("connected");
  });
});
