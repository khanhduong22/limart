import { describe, it, expect } from "vitest";
import {
  cn,
  formatCurrencyVND,
  formatDateVN,
  formatTimeVN,
  formatDateTimeVN,
  normalizeVietnamese,
} from "./utils";

describe("lib/utils", () => {
  describe("cn", () => {
    it("should merge tailwind classes properly", () => {
      expect(cn("px-2 py-1", "bg-blue-500")).toBe("px-2 py-1 bg-blue-500");
      expect(cn("px-2", { "px-4": true })).toBe("px-4");
      expect(cn("text-red-500", undefined, null, false && "hidden")).toBe("text-red-500");
    });
  });

  describe("formatCurrencyVND", () => {
    it("should format number as VND currency", () => {
      const formatted = formatCurrencyVND(50000);
      // Depending on node environment, it may contain non-breaking space and ₫ or VND
      expect(formatted).toMatch(/50[.,]000/);
    });
  });

  describe("formatDateVN", () => {
    it("should format date correctly in vi-VN", () => {
      const date = new Date(2026, 9, 12);
      expect(formatDateVN(date)).toBe("12/10/2026");
    });

    it("should return '--' for invalid date", () => {
      expect(formatDateVN("invalid-date")).toBe("--");
    });
  });

  describe("formatTimeVN", () => {
    it("should format time in 24h format", () => {
      const date = new Date(2026, 9, 12, 14, 30, 45);
      expect(formatTimeVN(date)).toBe("14:30:45");
    });

    it("should return '--:--' for invalid date", () => {
      expect(formatTimeVN("invalid-date")).toBe("--:--");
    });
  });

  describe("formatDateTimeVN", () => {
    it("should format date and time together", () => {
      const date = new Date(2026, 9, 12, 8, 15, 0);
      expect(formatDateTimeVN(date)).toBe("12/10/2026 08:15:00");
    });

    it("should return '--' for invalid date", () => {
      expect(formatDateTimeVN("invalid-date")).toBe("--");
    });
  });

  describe("normalizeVietnamese", () => {
    it("should remove diacritics and convert to lower case", () => {
      expect(normalizeVietnamese("Đăng bài")).toBe("dang bai");
      expect(normalizeVietnamese("Làm video")).toBe("lam video");
      expect(normalizeVietnamese("Đăng kí")).toBe("dang ki");
      expect(normalizeVietnamese("Nguyễn Văn Ánh")).toBe("nguyen van anh");
    });

    it("should return empty string for null, undefined, or empty", () => {
      expect(normalizeVietnamese(null)).toBe("");
      expect(normalizeVietnamese(undefined)).toBe("");
      expect(normalizeVietnamese("")).toBe("");
    });
  });
});
