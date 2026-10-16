import React, { useState, useEffect, useCallback } from "react";
import {
  BellRing,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  Send,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isLikelyDemoHost } from "@/lib/demo-mode";
import {
  getVapidPublicKey,
  subscribePushNotification,
  sendTestPushNotification,
  urlBase64ToUint8Array,
} from "@/lib/notification-client";

export type PermissionStatus = "default" | "granted" | "denied" | "unsupported";

export interface NotificationOptInCardProps {
  userId?: string;
  compact?: boolean;
  onSubscribed?: () => void;
}

const PUSH_SUBSCRIBED_STORAGE_KEY = "limart_staff_push_subscribed";

async function getServiceWorkerRegistration(
  timeoutMs = 500
): Promise<ServiceWorkerRegistration | null> {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !navigator.serviceWorker
  ) {
    return null;
  }

  try {
    if (typeof navigator.serviceWorker.getRegistration === "function") {
      const existing = await Promise.race([
        navigator.serviceWorker.getRegistration(),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
      ]);
      if (existing) {
        return existing;
      }
    }

    if (navigator.serviceWorker.ready) {
      const readyReg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
      return readyReg;
    }
  } catch {
    return null;
  }

  return null;
}

export const NotificationOptInCard: React.FC<NotificationOptInCardProps> = ({
  userId,
  compact = false,
  onSubscribed,
}) => {
  const isEnterpriseDemo = isLikelyDemoHost();
  const [permission, setPermission] = useState<PermissionStatus>("default");
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error">("success");

  const showFeedback = (msg: string, type: "success" | "error" = "success") => {
    setStatusMessage(msg);
    setStatusType(type);
    if (type === "success") {
      toast.success(msg);
    } else {
      toast.error(msg);
    }
  };

  const checkStatus = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    const currentPerm = (Notification.permission || "default") as PermissionStatus;
    setPermission(currentPerm);

    if (currentPerm === "granted") {
      try {
        const storedSub =
          typeof localStorage !== "undefined" &&
          localStorage.getItem(PUSH_SUBSCRIBED_STORAGE_KEY) === "true";
        if (storedSub) {
          setIsSubscribed(true);
        }

        const registration = await getServiceWorkerRegistration(400);
        if (
          registration?.pushManager &&
          typeof registration.pushManager.getSubscription === "function"
        ) {
          const sub = await registration.pushManager.getSubscription();
          if (sub) {
            setIsSubscribed(true);
          }
        }
      } catch (err) {
        console.warn("[NotificationOptInCard] Error checking push subscription:", err);
      }
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleSubscribe = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      let permResult: NotificationPermission = "granted";
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        typeof Notification.requestPermission === "function"
      ) {
        permResult = await Notification.requestPermission();
      }
      setPermission(permResult as PermissionStatus);

      if (permResult !== "granted") {
        showFeedback(
          "Bạn đã từ chối nhận thông báo. Vui lòng bật lại quyền thông báo trong cài đặt trình duyệt.",
          "error"
        );
        return;
      }

      let vapidPublicKey = "";
      try {
        vapidPublicKey = await getVapidPublicKey();
      } catch (err) {
        console.warn("[NotificationOptInCard] Fallback VAPID key used:", err);
      }

      const registration = await getServiceWorkerRegistration(500);
      let subscriptionJson: PushSubscriptionJSON | null = null;

      if (registration?.pushManager) {
        try {
          let sub =
            typeof registration.pushManager.getSubscription === "function"
              ? await registration.pushManager.getSubscription()
              : null;

          if (!sub && typeof registration.pushManager.subscribe === "function") {
            const options: PushSubscriptionOptionsInit = {
              userVisibleOnly: true,
            };
            if (vapidPublicKey) {
              options.applicationServerKey = urlBase64ToUint8Array(
                vapidPublicKey
              ) as unknown as BufferSource;
            }
            sub = await registration.pushManager.subscribe(options);
          }

          if (sub) {
            subscriptionJson =
              typeof sub.toJSON === "function"
                ? sub.toJSON()
                : (sub as unknown as PushSubscriptionJSON);
          }
        } catch (pushErr) {
          console.warn("[NotificationOptInCard] pushManager.subscribe fallback:", pushErr);
        }
      }

      if (!subscriptionJson) {
        subscriptionJson = {
          endpoint: `https://push.limart.vn/browser/${userId || "staff"}`,
          keys: {
            p256dh:
              "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
            auth: "tBHItJI5svbpez7KI4CCXg",
          },
        };
      }

      await subscribePushNotification(subscriptionJson);

      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(PUSH_SUBSCRIBED_STORAGE_KEY, "true");
        }
      } catch {}

      setIsSubscribed(true);
      showFeedback("Đã kích hoạt thông báo nhắc ca tự động thành công!", "success");
      onSubscribed?.();
    } catch (error: any) {
      console.error("[NotificationOptInCard] Subscribe error:", error);
      showFeedback(
        `Lỗi kích hoạt thông báo: ${error?.message || "Vui lòng thử lại sau"}`,
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTestNotification = async () => {
    setTesting(true);
    setStatusMessage(null);
    const previewTitle = "🔔 Thông báo Ca Trực LimArt";
    const previewBody =
      "⏰ Nhắc ca tự động: Chuẩn bị lên đường & kết nối WiFi bấm Check-in đúng giờ!";

    try {
      await sendTestPushNotification({
        title: previewTitle,
        body: previewBody,
        url: "/",
      });

      const currentPerm =
        typeof window !== "undefined" && "Notification" in window
          ? Notification.permission
          : permission;

      if (currentPerm === "granted") {
        let shownViaSw = false;
        const registration = await getServiceWorkerRegistration(400);
        if (registration && typeof registration.showNotification === "function") {
          try {
            await registration.showNotification(previewTitle, {
              body: previewBody,
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              tag: "shift-reminder-test",
              data: { url: "/" },
            });
            shownViaSw = true;
          } catch {
            shownViaSw = false;
          }
        }

        if (!shownViaSw && typeof window !== "undefined" && "Notification" in window) {
          try {
            new Notification(previewTitle, {
              body: previewBody,
              icon: "/icon-192.png",
            });
          } catch {}
        }
      }

      showFeedback(
        "Đã gửi thông báo thử nghiệm! Kiểm tra thanh thông báo trên thiết bị của bạn.",
        "success"
      );
    } catch (error: any) {
      console.error("[NotificationOptInCard] Test notification error:", error);
      showFeedback(
        `Không thể gửi thông báo thử nghiệm: ${error?.message || "Lỗi hệ thống"}`,
        "error"
      );
    } finally {
      setTesting(false);
    }
  };

  const isActivated = permission === "granted" && isSubscribed;

  return (
    <div
      data-testid="notification-opt-in-card"
      className={cn(
        "rounded-2xl flex flex-col bg-white/95 text-stone-900 border shadow-xs relative overflow-hidden transition-all duration-200",
        compact ? "p-3.5 gap-2.5" : "p-4 sm:p-5 gap-3.5",
        isEnterpriseDemo ? "border-indigo-100" : "border-orange-100"
      )}
    >
      {/* Header with Title & Live Status Badge */}
      <div className="flex items-center justify-between gap-2.5 relative z-10">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className={cn(
              "rounded-xl flex items-center justify-center shrink-0 border",
              compact ? "w-8 h-8" : "w-9 h-9",
              isEnterpriseDemo
                ? "bg-indigo-50 border-indigo-200/80 text-indigo-600"
                : "bg-orange-100/80 border-orange-200 text-orange-700"
            )}
          >
            <BellRing className={cn(compact ? "w-4 h-4" : "w-5 h-5")} />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <h3 className="font-bold text-xs sm:text-sm text-stone-900 tracking-tight truncate">
              Thông Báo Nhắc Ca Tự Động
            </h3>
            <p className="text-[11px] text-stone-500 truncate">
              Nhận nhắc nhở tự động trước giờ vào ca & tan ca
            </p>
          </div>
        </div>

        {isActivated && (
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10.5px] font-bold shrink-0 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span>Đã kích hoạt</span>
          </div>
        )}
      </div>

      {/* Status Alert Banner */}
      {permission === "denied" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs text-left">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>Trình duyệt đang chặn thông báo. Vui lòng mở khóa trong cài đặt trang web.</span>
        </div>
      )}

      {permission === "unsupported" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs text-left">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Trình duyệt hiện tại chưa hỗ trợ Web Push Notification.</span>
        </div>
      )}

      {/* Automatic Shift Reminder Schedule Highlights */}
      <div className={cn("grid grid-cols-1", compact ? "gap-1.5" : "gap-2")}>
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-xl border transition-colors text-left",
            compact ? "p-2" : "p-2.5",
            isEnterpriseDemo
              ? "bg-slate-50/80 border-slate-200/80"
              : "bg-orange-50/50 border-orange-100/80"
          )}
        >
          <span className="text-sm select-none mt-0.5">⏰</span>
          <div className="flex flex-col min-w-0">
            <span
              className={cn(
                "text-xs font-bold",
                isEnterpriseDemo ? "text-indigo-800" : "text-orange-900"
              )}
            >
              ⏰ Trước 30 phút &amp; 15 phút vào ca
            </span>
            <span className="text-[11px] font-medium text-stone-600 leading-snug">
              Nhắc chuẩn bị lên đường &amp; kết nối WiFi bấm Check-in đúng giờ
            </span>
          </div>
        </div>

        <div
          className={cn(
            "flex items-start gap-2.5 rounded-xl border transition-colors text-left",
            compact ? "p-2" : "p-2.5",
            isEnterpriseDemo
              ? "bg-slate-50/80 border-slate-200/80"
              : "bg-amber-50/50 border-amber-100/80"
          )}
        >
          <span className="text-sm select-none mt-0.5">🏁</span>
          <div className="flex flex-col min-w-0">
            <span
              className={cn(
                "text-xs font-bold",
                isEnterpriseDemo ? "text-indigo-800" : "text-amber-900"
              )}
            >
              🏁 Trước 30 phút &amp; 15 phút tan ca
            </span>
            <span className="text-[11px] font-medium text-stone-600 leading-snug">
              Nhắc rà soát công việc bàn giao ca &amp; bấm Check-out trước khi về
            </span>
          </div>
        </div>
      </div>

      {/* iOS Safari Notice */}
      <div
        className={cn(
          "flex items-start gap-2 rounded-xl border text-[11px] leading-relaxed text-stone-600 text-left",
          compact ? "p-2" : "p-2.5",
          isEnterpriseDemo
            ? "bg-slate-50/70 border-slate-200/70"
            : "bg-stone-50/90 border-stone-200/70"
        )}
      >
        <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
        <span>
          Lưu ý trên iPhone (iOS): Hãy bấm &apos;Thêm vào Màn hình chính&apos; (PWA) để nhận thông báo đẩy ngay cả khi khóa màn hình.
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 pt-0.5">
        {!isSubscribed && (
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={loading || permission === "denied"}
            className={cn(
              "w-full font-bold rounded-xl px-4 flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all text-xs tracking-wide cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-white",
              compact ? "py-2.5" : "py-3",
              isEnterpriseDemo
                ? "bg-indigo-600 hover:bg-indigo-700"
                : "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
            )}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Bell className="w-4 h-4" />
            )}
            <span>🔔 BẬT THÔNG BÁO CA TRỰC</span>
          </button>
        )}

        {(isSubscribed || permission === "granted") && (
          <button
            type="button"
            onClick={handleTestNotification}
            disabled={testing}
            className={cn(
              "w-full font-bold rounded-xl px-4 flex items-center justify-center gap-2 shadow-2xs active:scale-98 transition-all text-xs tracking-wide cursor-pointer disabled:opacity-50",
              compact ? "py-2.5" : "py-3",
              isEnterpriseDemo
                ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200"
                : "bg-orange-50 hover:bg-orange-100 text-orange-900 border border-orange-200"
            )}
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span>⚡ GỬI THÔNG BÁO THỬ NGHIỆM</span>
          </button>
        )}
      </div>

      {/* Inline Status Feedback */}
      {statusMessage && (
        <div
          role="status"
          className={cn(
            "px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 border text-left",
            statusType === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          )}
        >
          {statusType === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{statusMessage}</span>
        </div>
      )}
    </div>
  );
};

export default NotificationOptInCard;
