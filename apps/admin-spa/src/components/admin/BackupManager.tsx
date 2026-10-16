import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isLikelyDemoHost } from "@/lib/demo-mode";
import { toast } from "sonner";

export type TenantSnapshotScope =
  | "all"
  | "schedule"
  | "documents"
  | "tasks"
  | "holidays";

export interface ParsedTenantSnapshot {
  tenantId?: string;
  scope?: string;
  exportedAt?: string;
  checksum?: string;
  meta?: {
    tenantId?: string;
    scope?: string;
    exportedAt?: string;
    checksum?: string;
  };
  [key: string]: unknown;
}

const SCOPE_OPTIONS: { value: TenantSnapshotScope; label: string }[] = [
  {
    value: "all",
    label: "Toàn bộ cấu hình & dữ liệu cửa hàng (Full Tenant Snapshot)",
  },
  {
    value: "schedule",
    label: "Chỉ Lịch làm việc & Phân công ca (WorkShift & ShiftDuty)",
  },
  {
    value: "documents",
    label: "Chỉ Kho tài liệu SOP & Thông báo (Documents & Announcements)",
  },
  {
    value: "tasks",
    label: "Chỉ Công việc, Checklist & Khoán (Tasks & Checklists)",
  },
  {
    value: "holidays",
    label: "Chỉ Ngày lễ & Cấu hình IP (Holidays & AllowedIP)",
  },
];

async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function getAuthHeaders(extraHeaders?: Record<string, string>): HeadersInit {
  const token =
    typeof window !== "undefined" &&
    typeof window.localStorage?.getItem === "function"
      ? window.localStorage.getItem("auth_token")
      : null;
  return {
    ...(extraHeaders ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function BackupManager() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Surgical Per-Tenant Snapshot state (scoped strictly to current shop)
  const [scope, setScope] = useState<TenantSnapshotScope>("all");
  const [isExportingSnapshot, setIsExportingSnapshot] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [parsedSnapshot, setParsedSnapshot] =
    useState<ParsedTenantSnapshot | null>(null);
  const [isRestoringSnapshot, setIsRestoringSnapshot] = useState(false);

  if (isLikelyDemoHost()) {
    return null;
  }

  const handleDownload = async () => {
    try {
      setIsLoading(true);

      const params = new URLSearchParams();
      if (startDate) params.append("from", startDate);
      if (endDate) params.append("to", endDate);

      const url = `/api/admin/export?${params.toString()}`;

      const link = document.createElement("a");
      link.href = url;
      link.download = `backup_data_${
        new Date().toISOString().split("T")[0]
      }.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Đang tải xuống bản sao lưu...");
    } catch {
      toast.error("Không thể tải xuống bản sao lưu");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadSnapshot = async () => {
    try {
      setIsExportingSnapshot(true);
      const response = await fetch(
        `/api/admin/tenants/backup?${new URLSearchParams({ scope }).toString()}`,
        {
          method: "GET",
          headers: getAuthHeaders(),
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const snapshotData = await response.json();
      const dateStr = new Date().toISOString().split("T")[0];
      const resolvedTenant = snapshotData?.tenantId || "shop";
      const fileName = `tenant-snapshot-${resolvedTenant}-${scope}-${dateStr}.json`;
      const jsonString = JSON.stringify(snapshotData, null, 2);

      const link = document.createElement("a");
      if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        const blob = new Blob([jsonString], { type: "application/json" });
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(objectUrl);
        }
      } else {
        link.href = `data:application/json;charset=utf-8,${encodeURIComponent(jsonString)}`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      toast.success("Đã xuất gói Snapshot kèm chữ ký SHA-256 thành công!");
    } catch {
      toast.error("Không thể xuất gói Snapshot cửa hàng");
    } finally {
      setIsExportingSnapshot(false);
    }
  };

  const handleSnapshotFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFileName("");
      setParsedSnapshot(null);
      return;
    }

    try {
      const rawText = await readFileAsText(file);
      const parsed = JSON.parse(rawText) as ParsedTenantSnapshot;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid snapshot JSON");
      }
      setSelectedFileName(file.name);
      setParsedSnapshot(parsed);
    } catch {
      setSelectedFileName("");
      setParsedSnapshot(null);
      toast.error("File Snapshot không hợp lệ hoặc bị hỏng định dạng JSON");
    }
  };

  const handleRestoreSnapshot = async () => {
    if (!parsedSnapshot) {
      toast.error("Vui lòng chọn file Snapshot (.json) trước khi khôi phục");
      return;
    }

    try {
      setIsRestoringSnapshot(true);
      const response = await fetch("/api/admin/tenants/restore", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ snapshot: parsedSnapshot }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json().catch(() => ({}));
      const countsObj = result?.restored ?? result?.counts;
      const countsSummary =
        countsObj && typeof countsObj === "object"
          ? Object.entries(countsObj as Record<string, unknown>)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ")
          : typeof countsObj === "number"
            ? `${countsObj} bản ghi`
            : "";

      toast.success(
        countsSummary
          ? `Khôi phục dữ liệu cửa hàng thành công (${countsSummary})!`
          : "Khôi phục dữ liệu cửa hàng thành công!"
      );
    } catch {
      toast.error("Không thể khôi phục dữ liệu từ gói Snapshot");
    } finally {
      setIsRestoringSnapshot(false);
    }
  };

  const previewTenantId =
    parsedSnapshot?.tenantId ?? parsedSnapshot?.meta?.tenantId ?? "N/A";
  const previewScope =
    parsedSnapshot?.scope ?? parsedSnapshot?.meta?.scope ?? "N/A";
  const previewExportedAt =
    parsedSnapshot?.exportedAt ?? parsedSnapshot?.meta?.exportedAt ?? "N/A";
  const previewChecksum =
    parsedSnapshot?.checksum ?? parsedSnapshot?.meta?.checksum ?? "";

  return (
    <div className="space-y-6">
      <div
        id="backup-data-section"
        className="rounded-xl border bg-white text-card-foreground shadow-sm"
      >
        <div className="flex flex-col space-y-1.5 p-6 border-b">
          <h3 className="text-xl font-semibold leading-none tracking-tight">
            Sao lưu dữ liệu
          </h3>
          <p className="text-sm text-muted-foreground">
            Tải xuống dữ liệu hệ thống (Check-in, Ca làm việc) theo khoảng thời
            gian.
          </p>
        </div>
        <div className="p-3.5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-end min-w-0">
            <div className="grid w-full max-w-sm items-center gap-1.5 min-w-0">
              <Label htmlFor="from">Từ ngày</Label>
              <Input
                type="date"
                id="from"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white h-10 sm:h-9 min-h-[38px] text-base sm:text-sm w-full max-w-full min-w-0"
              />
            </div>
            <div className="grid w-full max-w-sm items-center gap-1.5 min-w-0">
              <Label htmlFor="to">Đến ngày</Label>
              <Input
                type="date"
                id="to"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white h-10 sm:h-9 min-h-[38px] text-base sm:text-sm w-full max-w-full min-w-0"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleDownload}
              disabled={isLoading}
              className="w-full sm:w-auto bg-primary text-white min-h-[38px] h-10 sm:h-9"
            >
              {isLoading ? "Đang xử lý..." : "📥 Tải về bản Backup (.xlsx)"}
            </Button>

            {(startDate || endDate) && (
              <Button
                variant="outline"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                title="Xóa bộ lọc ngày"
                className="w-full sm:w-auto min-h-[38px] h-10 sm:h-9"
              >
                Xóa bộ lọc
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground italic">
            * Nếu không chọn ngày, hệ thống sẽ tải toàn bộ dữ liệu.
          </p>
        </div>
      </div>

      <div
        id="tenant-snapshot-section"
        className="rounded-xl border bg-white text-card-foreground shadow-sm"
      >
        <div className="flex flex-col space-y-1.5 p-6 border-b">
          <h3 className="text-xl font-semibold leading-none tracking-tight">
            🛡️ Sao lưu & Khôi phục Phẫu thuật theo Cửa hàng (Tenant Snapshot)
          </h3>
          <p className="text-sm text-muted-foreground">
            Xuất hoặc khôi phục dữ liệu riêng biệt của cửa hàng hiện tại hoặc từng phân hệ (Lịch ca, Tài liệu SOP, Công việc) kèm chữ ký bảo mật SHA-256.
          </p>
        </div>

        <div className="p-3.5 sm:p-6 space-y-6">
          <div className="grid w-full max-w-md items-center gap-1.5">
            <Label htmlFor="scope-select">Phạm vi dữ liệu (Scope)</Label>
            <select
              id="scope-select"
              value={scope}
              onChange={(e) =>
                setScope(e.target.value as TenantSnapshotScope)
              }
              className="flex h-10 sm:h-9 min-h-[38px] w-full rounded-md border border-input bg-white px-3 py-1 text-base sm:text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {SCOPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              onClick={handleDownloadSnapshot}
              disabled={isExportingSnapshot}
              className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white min-h-[38px] h-10 sm:h-9"
            >
              {isExportingSnapshot
                ? "Đang tạo Snapshot..."
                : "📦 Tải Snapshot Cửa hàng (.json)"}
            </Button>
          </div>

          <div className="border-t pt-5 space-y-4">
            <div className="space-y-1">
              <h4 className="text-base font-semibold text-slate-900">
                ♻️ Khôi phục Phẫu thuật từ file Snapshot (.json)
              </h4>
              <p className="text-xs text-muted-foreground">
                Chọn file Snapshot (.json) đã sao lưu trước đó để kiểm tra chữ ký SHA-256 và khôi phục vào cửa hàng hiện tại.
              </p>
            </div>

            <div className="grid w-full max-w-md items-center gap-1.5">
              <Label htmlFor="snapshot-file-input">
                File Snapshot (.json)
              </Label>
              <Input
                id="snapshot-file-input"
                type="file"
                accept=".json,application/json"
                onChange={handleSnapshotFileChange}
                className="bg-white h-10 sm:h-9 min-h-[38px] text-sm cursor-pointer"
              />
            </div>

            {parsedSnapshot && (
              <div
                data-testid="snapshot-preview-badge"
                className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-950 space-y-1.5"
              >
                <div className="font-semibold text-emerald-900 flex flex-wrap items-center gap-2">
                  <span>✅ Gói Snapshot hợp lệ</span>
                  {selectedFileName && (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-[11px]">
                      {selectedFileName}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-emerald-800">
                  <div>
                    <span className="font-medium">Tenant gốc:</span>{" "}
                    <span className="font-mono">{String(previewTenantId)}</span>
                  </div>
                  <div>
                    <span className="font-medium">Phạm vi (Scope):</span>{" "}
                    <span className="font-mono">{String(previewScope)}</span>
                  </div>
                  <div>
                    <span className="font-medium">Thời điểm xuất:</span>{" "}
                    <span className="font-mono">{String(previewExportedAt)}</span>
                  </div>
                  <div>
                    <span className="font-medium">SHA-256 Checksum:</span>{" "}
                    <span
                      className="font-mono"
                      title={String(previewChecksum)}
                    >
                      {previewChecksum
                        ? `${String(previewChecksum).slice(0, 16)}...`
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Button
                type="button"
                onClick={handleRestoreSnapshot}
                disabled={!parsedSnapshot || isRestoringSnapshot}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white min-h-[38px] h-10 sm:h-9"
              >
                {isRestoringSnapshot
                  ? "Đang khôi phục..."
                  : "♻️ Xác nhận Khôi phục vào Cửa hàng"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


