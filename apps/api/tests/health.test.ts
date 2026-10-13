import { describe, it, expect, vi } from "vitest";

// Mock DB and external services before importing app
vi.mock("@checkin/db", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  },
}));

vi.mock("../src/lib/cache", () => ({
  checkCacheHealth: vi.fn().mockResolvedValue("connected"),
  getOrSetCache: vi.fn().mockImplementation((_k, _t, fn) => fn()),
}));

vi.mock("../src/lib/meilisearch", () => ({
  checkMeiliHealth: vi.fn().mockResolvedValue("connected"),
}));

import { app } from "../src/app";

describe("GET /health", () => {
  it("returns status 200 and healthy status payload", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.db).toBe("connected");
    expect(data.valkey).toBe("connected");
    expect(data.meilisearch).toBe("connected");
    expect(typeof data.time).toBe("string");
    expect(typeof data.uptimeSeconds).toBe("number");
    expect(res.headers.get("ETag")).toBeTruthy();
  });
});
