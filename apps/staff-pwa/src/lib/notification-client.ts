import { authFetch as fetchWithAuth } from "@/lib/api-client";

/**
 * Convert a URL-safe base64 string to a Uint8Array for PushManager.subscribe(applicationServerKey).
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData =
    typeof window !== "undefined" && typeof window.atob === "function"
      ? window.atob(base64)
      : Buffer.from(base64, "base64").toString("binary");

  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Retrieve the VAPID public key from the backend for Web Push subscription.
 */
export async function getVapidPublicKey(): Promise<string> {
  const res = await fetchWithAuth("/api/notifications/vapid-public-key", {
    method: "GET",
  });
  if (!res.ok) {
    throw new Error(`Không thể tải VAPID public key (HTTP ${res.status})`);
  }
  const data = await res.json();
  return data?.publicKey || data?.data?.publicKey || "";
}

/**
 * Register the browser's PushSubscription on the backend for the current staff user.
 */
export async function subscribePushNotification(
  subscription: PushSubscriptionJSON
): Promise<any> {
  const payload = {
    endpoint: subscription.endpoint || "https://push.limart.vn/browser-fallback",
    keys: {
      p256dh: subscription.keys?.p256dh || "",
      auth: subscription.keys?.auth || "",
    },
  };

  const res = await fetchWithAuth("/api/notifications/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || err?.message || `Đăng ký thông báo thất bại (HTTP ${res.status})`);
  }

  return await res.json();
}

/**
 * Trigger an immediate test Web Push notification for the current staff user.
 */
export async function sendTestPushNotification(payload?: {
  title?: string;
  body?: string;
  url?: string;
}): Promise<any> {
  const res = await fetchWithAuth("/api/notifications/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      payload || {
        title: "🔔 Thông báo Ca Trực",
        body: "Hệ thống nhắc lịch ca tự động (trước 30 phút & 15 phút) đã hoạt động!",
        url: "/",
      }
    ),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || err?.message || `Gửi thông báo thử nghiệm thất bại (HTTP ${res.status})`);
  }

  return await res.json();
}

/**
 * Fetch the current staff user's recent shift notifications & subscription status.
 */
export async function fetchMyNotifications(): Promise<any> {
  const res = await fetchWithAuth("/api/notifications/my", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || err?.message || `Không thể tải danh sách thông báo (HTTP ${res.status})`);
  }

  return await res.json();
}
