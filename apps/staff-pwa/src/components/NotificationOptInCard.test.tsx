import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationOptInCard } from "./NotificationOptInCard";
import * as notificationClient from "@/lib/notification-client";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/notification-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notification-client")>();
  return {
    ...actual,
    getVapidPublicKey: vi.fn(),
    subscribePushNotification: vi.fn(),
    sendTestPushNotification: vi.fn(),
    fetchMyNotifications: vi.fn(),
  };
});

describe("NotificationOptInCard & Web Push Shift Reminders", () => {
  const mockRequestPermission = vi.fn();
  const mockShowNotification = vi.fn();
  const mockSubscribe = vi.fn();
  const mockGetSubscription = vi.fn();
  const mockNotificationConstructor = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    try {
      localStorage.clear();
    } catch {}

    mockRequestPermission.mockResolvedValue("granted");
    mockShowNotification.mockResolvedValue(undefined);
    mockGetSubscription.mockResolvedValue(null);
    mockSubscribe.mockResolvedValue({
      endpoint: "https://fcm.googleapis.com/fcm/send/staff-endpoint-123",
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/staff-endpoint-123",
        keys: {
          p256dh: "test-p256dh-key",
          auth: "test-auth-key",
        },
      }),
    });

    const FakeNotification: any = function (title: string, options?: NotificationOptions) {
      mockNotificationConstructor(title, options);
    };
    FakeNotification.permission = "default";
    FakeNotification.requestPermission = mockRequestPermission;

    Object.defineProperty(window, "Notification", {
      value: FakeNotification,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "Notification", {
      value: FakeNotification,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        getRegistration: vi.fn().mockResolvedValue({
          showNotification: mockShowNotification,
          pushManager: {
            getSubscription: mockGetSubscription,
            subscribe: mockSubscribe,
          },
        }),
        ready: Promise.resolve({
          showNotification: mockShowNotification,
          pushManager: {
            getSubscription: mockGetSubscription,
            subscribe: mockSubscribe,
          },
        }),
      },
      writable: true,
      configurable: true,
    });

    vi.mocked(notificationClient.getVapidPublicKey).mockResolvedValue(
      "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM"
    );
    vi.mocked(notificationClient.subscribePushNotification).mockResolvedValue({
      success: true,
      message: "Subscribed",
    });
    vi.mocked(notificationClient.sendTestPushNotification).mockResolvedValue({
      success: true,
      message: "Sent test push",
    });
  });

  it("renders the 15m/30m automatic shift reminder schedule and iOS PWA notice", () => {
    render(<NotificationOptInCard userId="staff-001" />);

    expect(screen.getByText("Thông Báo Nhắc Ca Tự Động")).toBeDefined();
    expect(screen.getByText(/Trước 30 phút & 15 phút vào ca/i)).toBeDefined();
    expect(
      screen.getByText(/Nhắc chuẩn bị lên đường & kết nối WiFi bấm Check-in đúng giờ/i)
    ).toBeDefined();
    expect(screen.getByText(/Trước 30 phút & 15 phút tan ca/i)).toBeDefined();
    expect(
      screen.getByText(/Nhắc rà soát công việc bàn giao ca & bấm Check-out trước khi về/i)
    ).toBeDefined();
    expect(
      screen.getByText(
        /Lưu ý trên iPhone \(iOS\): Hãy bấm 'Thêm vào Màn hình chính' \(PWA\) để nhận thông báo đẩy ngay cả khi khóa màn hình\./i
      )
    ).toBeDefined();
    expect(screen.getByRole("button", { name: /BẬT THÔNG BÁO CA TRỰC/i })).toBeDefined();
  });

  it("requests permission, subscribes via pushManager, and activates when clicking 'BẬT THÔNG BÁO CA TRỰC'", async () => {
    const onSubscribed = vi.fn();
    render(<NotificationOptInCard userId="staff-001" onSubscribed={onSubscribed} />);

    const enableBtn = screen.getByRole("button", { name: /BẬT THÔNG BÁO CA TRỰC/i });
    fireEvent.click(enableBtn);

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
      expect(notificationClient.getVapidPublicKey).toHaveBeenCalledTimes(1);
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
      expect(notificationClient.subscribePushNotification).toHaveBeenCalledWith({
        endpoint: "https://fcm.googleapis.com/fcm/send/staff-endpoint-123",
        keys: {
          p256dh: "test-p256dh-key",
          auth: "test-auth-key",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Đã kích hoạt")).toBeDefined();
      expect(screen.getByRole("button", { name: /GỬI THÔNG BÁO THỬ NGHIỆM/i })).toBeDefined();
      expect(onSubscribed).toHaveBeenCalledTimes(1);
    });
  });

  it("dispatches test push notification and triggers local notification preview when clicking 'GỬI THÔNG BÁO THỬ NGHIỆM'", async () => {
    (window.Notification as any).permission = "granted";
    mockGetSubscription.mockResolvedValue({
      endpoint: "https://fcm.googleapis.com/fcm/send/staff-endpoint-123",
    });

    render(<NotificationOptInCard userId="staff-001" compact />);

    const testBtn = await screen.findByRole("button", {
      name: /GỬI THÔNG BÁO THỬ NGHIỆM/i,
    });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(notificationClient.sendTestPushNotification).toHaveBeenCalledTimes(1);
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.stringContaining("Thông báo Ca Trực"),
        expect.objectContaining({
          icon: "/icon-192.png",
        })
      );
    });

    expect(
      await screen.findByText(
        /Đã gửi thông báo thử nghiệm! Kiểm tra thanh thông báo trên thiết bị của bạn\./i
      )
    ).toBeDefined();
  });

  it("converts base64url VAPID public key to Uint8Array properly", () => {
    const sampleKey =
      "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
    const arr = notificationClient.urlBase64ToUint8Array(sampleKey);
    expect(arr).toBeInstanceOf(Uint8Array);
    expect(arr.length).toBe(65);
  });
});
