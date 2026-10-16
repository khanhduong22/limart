import React from "react";

const NotificationAdminPanel = React.lazy(
  () => import("@/components/admin/NotificationAdminPanel")
);

const AnnouncementAdminClient = React.lazy(
  () => import("@/components/admin/AnnouncementAdminClient")
);

export function AnnouncementsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Quản lý Thông báo &amp; Nhắc Ca Tự Động
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Cấu hình bắn Web Push tự động trước 15 &amp; 30 phút khi vào ca / tan ca cho nhân viên trực hôm nay và đăng bản tin nội bộ
          </p>
        </div>
      </div>

      <React.Suspense
        fallback={
          <div className="h-64 w-full animate-pulse rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xs text-slate-400">
            Đang tải cấu hình nhắc ca tự động...
          </div>
        }
      >
        <NotificationAdminPanel />
      </React.Suspense>

      <React.Suspense
        fallback={
          <div className="h-96 w-full animate-pulse rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xs text-slate-400">
            Đang tải danh sách thông báo...
          </div>
        }
      >
        <AnnouncementAdminClient />
      </React.Suspense>
    </div>
  );
}

