import Redis from "ioredis";

let redisClient: Redis | null = null;

function createRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL || process.env.VALKEY_URL;
  if (!redisUrl) return null;

  try {
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 2000,
      enableOfflineQueue: false,
      retryStrategy(times) {
        return Math.min(times * 200, 2000);
      },
    });

    client.on("error", (err) => {
      console.warn("[Cache Client Warning]", err?.message || err);
    });

    return client;
  } catch (err) {
    console.warn("[Cache Client Init Error]", err);
    return null;
  }
}

export function getRedisClient(): Redis | null {
  if (!redisClient || redisClient.status === "end") {
    redisClient = createRedisClient();
  }
  return redisClient;
}

export function setRedisClient(client: Redis | null) {
  redisClient = client;
}

export const inFlightPromises = new Map<string, Promise<any>>();

export interface CacheOptions {
  disableJitter?: boolean;
  jitterRatio?: number;
}

/**
 * Calculates a jittered TTL to prevent cache stampedes / thundering herds (default ±15%).
 */
export function getJitteredTTL(baseTTLSeconds: number, jitterRatio = 0.15): number {
  if (baseTTLSeconds <= 0) return baseTTLSeconds;
  const min = baseTTLSeconds * (1 - jitterRatio);
  const max = baseTTLSeconds * (1 + jitterRatio);
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export async function getOrSetCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
  options?: CacheOptions
): Promise<T> {
  // If an in-flight fetch already exists for this key, await that promise (SingleFlight deduplication)
  const existingInFlight = inFlightPromises.get(key);
  if (existingInFlight) {
    return existingInFlight as Promise<T>;
  }

  let client: Redis | null = null;
  try {
    client = getRedisClient();
    if (client) {
      const cached = await client.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    }
  } catch {
    // Fallback directly to DB
  }

  // Cache miss: double-check in-flight map in case another request started fetching during Redis lookup
  if (inFlightPromises.has(key)) {
    return inFlightPromises.get(key) as Promise<T>;
  }

  // Create deduplicated in-flight fetch promise
  const fetchPromise = (async () => {
    try {
      const data = await fetcher();

      if (client && data !== undefined && data !== null) {
        try {
          const actualTTL = options?.disableJitter
            ? ttlSeconds
            : getJitteredTTL(ttlSeconds, options?.jitterRatio ?? 0.15);
          await client.setex(key, actualTTL, JSON.stringify(data));
        } catch {
          // Ignore cache write error
        }
      }

      return data;
    } finally {
      inFlightPromises.delete(key);
    }
  })();

  inFlightPromises.set(key, fetchPromise);
  return fetchPromise;
}

/**
 * Invalidate a single cache key
 */
export async function invalidateCache(key: string): Promise<void> {
  try {
    const client = getRedisClient();
    if (client) {
      await client.del(key);
    }
  } catch (error) {
    console.warn(`[Cache Invalidate Error] Key ${key}:`, error);
  }
}

/**
 * Invalidate cache keys matching a pattern (e.g. "payroll:*", "stats:*")
 */
export async function invalidateCachePattern(pattern: string): Promise<void> {
  try {
    const client = getRedisClient();
    if (!client) {
      return;
    }

    if (typeof (client as any).scanStream !== "function") {
      if (typeof client.keys === "function") {
        const keys = await client.keys(pattern);
        if (keys && keys.length > 0) {
          await client.del(...keys);
        }
      }
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const stream = (client as any).scanStream({ match: pattern, count: 100 });
      const pipelinePromises: Promise<unknown>[] = [];

      stream.on("data", (keys: string[]) => {
        if (keys && keys.length > 0) {
          const pipeline = client.pipeline();
          pipeline.del(...keys);
          pipelinePromises.push(pipeline.exec());
        }
      });

      stream.on("end", async () => {
        try {
          await Promise.all(pipelinePromises);
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      stream.on("error", (err: any) => {
        reject(err);
      });
    });
  } catch (error) {
    console.warn(`[Cache Invalidate Pattern Error] Pattern ${pattern}:`, error);
  }
}

export async function checkCacheHealth(): Promise<"connected" | "disconnected"> {
  const client = getRedisClient();
  if (!client) return "disconnected";
  try {
    const pong = await client.ping();
    return pong === "PONG" ? "connected" : "disconnected";
  } catch {
    return "disconnected";
  }
}

/**
 * Invalidate shift duties and upcoming shifts cache
 */
export async function invalidateShiftDutyCache(userId?: string, shiftId?: number): Promise<void> {
  try {
    await invalidateCachePattern("shift-duties:*");
    await invalidateCachePattern("shifts:*");
    await invalidateCachePattern("staff:home:*");
  } catch (e) {
    console.warn("[Cache Warning] Failed to invalidate shift duty cache:", e);
  }
}

/**
 * Invalidate monthly payroll cache and user stats cache
 */
export async function invalidatePayrollCache(): Promise<void> {
  try {
    await invalidateCachePattern("payroll:*");
    await invalidateCachePattern("stats:*");
    await invalidateCachePattern("stats:monthly:*");
    await invalidateCachePattern("admin:dashboard:*");
    await invalidateCachePattern("admin:reports:*");
  } catch (e) {
    console.warn("[Cache Warning] Failed to invalidate payroll cache:", e);
  }
}

/**
 * Invalidate user monthly stats cache
 */
export async function invalidateUserStatsCache(userId?: string): Promise<void> {
  try {
    if (userId) {
      await invalidateCachePattern(`stats:monthly:${userId}:*`);
    } else {
      await invalidateCachePattern(`stats:monthly:*`);
    }
    await invalidateCachePattern(`admin:dashboard:*`);
  } catch (e) {
    console.warn("[Cache Warning] Failed to invalidate stats cache:", e);
  }
}


