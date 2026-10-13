/**
 * Offline Outbox Queue for LimArt Staff PWA
 * Supports IndexedDB with seamless localStorage fallback.
 * Automatically enqueues check-in/out requests when offline,
 * and flushes them to POST /api/checkins/sync-offline when network restores.
 */

export interface OfflineCheckinItem {
  id: string;
  userId?: string;
  type: "checkin" | "checkout";
  timestamp: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  note?: string;
  status: "pending" | "syncing" | "failed" | "synced";
  errorMessage?: string;
  isTerminalError?: boolean;
  retryCount: number;
  createdAt: number;
}

const DB_NAME = "limart_pwa_db";
const STORE_NAME = "outbox_checkins";
const DB_VERSION = 1;
const STORAGE_KEY = "limart_offline_checkins_fallback";

type QueueSubscriber = (items: OfflineCheckinItem[], isOnline: boolean) => void;
const subscribers: Set<QueueSubscriber> = new Set();

let isFlushing = false;

function getStoredAuthToken(): string | null {
  try {
    const token = localStorage.getItem("limart_staff_jwt_token") || null;
    if (token && token !== "cookie_session") {
      return token;
    }
    return null;
  } catch {
    return null;
  }
}

function getCurrentUserId(): string | null {
  try {
    const raw = localStorage.getItem("limart_staff_profile_cache");
    if (raw) {
      const p = JSON.parse(raw);
      return (p && typeof p === "object" && typeof p.id === "string") ? p.id : null;
    }
  } catch {}
  return null;
}

// 1. IndexedDB Helper
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not supported"));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 2. Storage Adapter (IndexedDB with LocalStorage Fallback)
export async function getStoredQueue(): Promise<OfflineCheckinItem[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Fallback to localStorage
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        localStorage.removeItem(STORAGE_KEY);
      }
      return [];
    } catch {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      return [];
    }
  }
}

async function saveItem(item: OfflineCheckinItem): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Fallback
    const list = await getStoredQueue();
    const idx = list.findIndex((i) => i.id === item.id);
    if (idx >= 0) list[idx] = item;
    else list.push(item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
}

async function removeItem(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    const list = (await getStoredQueue()).filter((i) => i.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
}

// 3. Notify Subscribers
async function notifySubscribers() {
  const items = await getStoredQueue();
  const online = isNetworkOnline();
  subscribers.forEach((sub) => {
    try {
      sub(items, online);
    } catch (err) {
      console.error("[OfflineQueue] Subscriber error:", err);
    }
  });
}

export function subscribeToQueue(callback: QueueSubscriber): () => void {
  subscribers.add(callback);
  // Initial fire
  getStoredQueue().then((items) => callback(items, isNetworkOnline()));
  return () => {
    subscribers.delete(callback);
  };
}

export function isNetworkOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

// 4. Enqueue Check-in / Check-out
export async function enqueueCheckin(payload: {
  type: "checkin" | "checkout";
  userId?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  note?: string;
  clientTimestamp?: string;
}): Promise<OfflineCheckinItem> {
  const resolvedUserId = payload.userId || getCurrentUserId() || undefined;
  const item: OfflineCheckinItem = {
    id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    userId: resolvedUserId,
    type: payload.type,
    timestamp: payload.clientTimestamp || new Date().toISOString(),
    latitude: payload.latitude,
    longitude: payload.longitude,
    accuracy: payload.accuracy,
    note: payload.note,
    status: "pending",
    retryCount: 0,
    createdAt: Date.now(),
  };

  await saveItem(item);
  await notifySubscribers();

  // If currently online, try to flush immediately
  if (isNetworkOnline()) {
    setTimeout(() => {
      flushQueue();
    }, 100);
  }

  return item;
}

// 5. Flush Queue to Server
export async function flushQueue(): Promise<{
  success: boolean;
  syncedCount: number;
  errors: string[];
}> {
  if (isFlushing) {
    return { success: false, syncedCount: 0, errors: ["Already syncing"] };
  }

  if (!isNetworkOnline()) {
    return { success: false, syncedCount: 0, errors: ["Device is offline"] };
  }

  const allItems = await getStoredQueue();
  const currentUserId = getCurrentUserId();
  const token = getStoredAuthToken();

  // Filter pending items:
  // - Exclude terminal business errors (status 400 errors that cannot succeed on auto-retry)
  // - Only sync items matching current logged-in user to prevent cross-user attribution leak
  const pendingItems = allItems.filter((i) => {
    if (i.isTerminalError) return false;
    if (i.status !== "pending" && i.status !== "failed") return false;
    if (i.userId && currentUserId && i.userId !== currentUserId) return false;
    return true;
  });

  if (pendingItems.length === 0) {
    return { success: true, syncedCount: 0, errors: [] };
  }

  isFlushing = true;
  let syncedCount = 0;
  const errors: string[] = [];

  // Update items to syncing status
  for (const item of pendingItems) {
    item.status = "syncing";
    await saveItem(item);
  }
  await notifySubscribers();

  const authHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    // Attempt batch sync endpoint first: POST /api/checkins/sync-offline
    const response = await fetch("/api/checkins/sync-offline", {
      method: "POST",
      headers: authHeaders,
      credentials: "include",
      body: JSON.stringify({
        items: pendingItems.map((i) => ({
          id: i.id,
          type: i.type,
          timestamp: i.timestamp,
          note: i.note,
          latitude: i.latitude,
          longitude: i.longitude,
        })),
      }),
    }).catch(() => null);

    if (response && response.status === 401) {
      try {
        localStorage.removeItem("limart_staff_jwt_token");
      } catch {}
    }

    if (response && response.ok) {
      const resData = await response.json().catch(() => ({}));
      console.log("[OfflineQueue] Batch sync response:", resData);

      if (Array.isArray(resData.results)) {
        for (const resItem of resData.results) {
          const item = pendingItems.find((i) => i.id === resItem.id);
          if (!item) continue;
          if (resItem.success) {
            await removeItem(item.id);
            syncedCount++;
          } else {
            item.status = "failed";
            item.errorMessage = resItem.error || "Lỗi nghiệp vụ khi đồng bộ";
            // Mark terminal so it won't loop forever
            item.isTerminalError = true;
            item.retryCount += 1;
            await saveItem(item);
            errors.push(`Item ${item.id}: ${item.errorMessage}`);
          }
        }
      } else {
        for (const item of pendingItems) {
          await removeItem(item.id);
          syncedCount++;
        }
      }
    } else {
      // Fallback: sync individually via standard POST /api/checkins
      for (const item of pendingItems) {
        try {
          const res = await fetch("/api/checkins", {
            method: "POST",
            headers: authHeaders,
            credentials: "include",
            body: JSON.stringify({
              type: item.type,
              latitude: item.latitude,
              longitude: item.longitude,
              note: item.note
                ? `${item.note} (Đồng bộ offline)`
                : `(Đồng bộ offline: ${new Date(item.timestamp).toLocaleTimeString()})`,
              clientTimestamp: item.timestamp,
              timestamp: item.timestamp,
            }),
          });

          if (res.ok) {
            await removeItem(item.id);
            syncedCount++;
          } else {
            if (res.status === 401) {
              try {
                localStorage.removeItem("limart_staff_jwt_token");
              } catch {}
            }
            const errJson = await res.json().catch(() => ({}));
            const errorMsg = errJson.error || errJson.message || `Lỗi máy chủ (${res.status})`;
            item.status = "failed";
            item.errorMessage = errorMsg;
            item.retryCount += 1;
            // When server returns 400 (business logic error like "Chưa check-out ca trước"),
            // mark terminal to halt infinite retry loop
            if (res.status === 400) {
              item.isTerminalError = true;
            }
            await saveItem(item);
            errors.push(`Item ${item.id}: ${item.errorMessage}`);
          }
        } catch (itemErr: any) {
          item.status = "failed";
          item.errorMessage = itemErr.message || "Lỗi mạng khi đồng bộ";
          item.retryCount += 1;
          await saveItem(item);
          errors.push(`Item ${item.id}: ${item.errorMessage}`);
        }
      }
    }
  } catch (err: any) {
    console.error("[OfflineQueue] Flush fatal error:", err);
    errors.push(err.message || "Lỗi đồng bộ ngoại tuyến");
  } finally {
    isFlushing = false;
    await notifySubscribers();
  }

  return {
    success: errors.length === 0,
    syncedCount,
    errors,
  };
}

// 6. Setup Global Network Listeners
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("[OfflineQueue] Network restored (online). Triggering flush...");
    notifySubscribers();
    flushQueue();
  });

  window.addEventListener("offline", () => {
    console.log("[OfflineQueue] Network lost (offline).");
    notifySubscribers();
  });
}
