import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettings } from "@/hooks/useAdminData";

const IPManager = React.lazy(() => import("@/components/admin/IPManager"));
const HolidayManager = React.lazy(() => import("@/components/admin/HolidayManager"));
const BackupManager = React.lazy(() => import("@/components/admin/BackupManager"));

export function SettingsPage() {
  const { settings } = useSettings();

  const ips = (settings?.allowedIps || []).map((prefix: string, i: number) => ({
    id: i + 1,
    prefix,
    label: "IP Cho phép",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Cấu hình Hệ thống
        </h2>
        <p className="text-sm text-muted-foreground">
          Quản lý dải IP văn phòng được phép chấm công, cấu hình ngày lễ và sao lưu dữ liệu
        </p>
      </div>

      <Tabs defaultValue="access" className="space-y-4">
        <div className="overflow-x-auto no-scrollbar -mx-1 px-1 sm:mx-0 sm:px-0">
          <TabsList className="bg-white border inline-flex w-auto min-w-full sm:w-auto h-auto p-1 gap-1">
            <TabsTrigger value="access" className="text-xs sm:text-sm py-2 px-3 min-h-[38px]">Truy cập & Bảo mật (IP)</TabsTrigger>
            <TabsTrigger value="holidays" className="text-xs sm:text-sm py-2 px-3 min-h-[38px]">Ngày Lễ & Lương</TabsTrigger>
            <TabsTrigger value="backup" className="text-xs sm:text-sm py-2 px-3 min-h-[38px]">Sao lưu & Dữ liệu</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="access" className="space-y-4">
          <React.Suspense fallback={<div className="h-64 w-full animate-pulse rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xs text-slate-400">Đang tải cấu hình IP...</div>}>
            <IPManager ips={ips} />
          </React.Suspense>
        </TabsContent>

        <React.Suspense fallback={<div className="p-8 text-center text-muted-foreground">Đang tải...</div>}>
          <TabsContent value="holidays" className="space-y-4">
            <HolidayManager />
          </TabsContent>

          <TabsContent value="backup" className="space-y-4">
            <BackupManager />
          </TabsContent>
        </React.Suspense>
      </Tabs>
    </div>
  );
}
