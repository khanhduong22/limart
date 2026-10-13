import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api";

const CreateAnnouncementDialog = React.lazy(
  () => import("./announcement/CreateAnnouncementDialog")
);

export default function AnnouncementAdminClient({
  announcements: initialAnnouncements = [],
  onRefresh,
}: {
  announcements?: any[];
  onRefresh?: () => void;
}) {
  const [announcements, setAnnouncements] = useState<any[]>(initialAnnouncements);
  const [isOpen, setIsOpen] = useState(false);

  const fetchAnnouncements = async () => {
    try {
      const res = await api.get<any>("/api/admin/announcements");
      const list = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
        ? res.data
        : [];
      setAnnouncements(list);
    } catch {
      // ignore
    }
  };

  React.useEffect(() => {
    if (initialAnnouncements.length > 0) {
      setAnnouncements(initialAnnouncements);
    } else {
      fetchAnnouncements();
    }
  }, [initialAnnouncements]);

  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      await api.patch(`/api/admin/announcements/${id}/toggle`, {
        active: !currentStatus,
      });
      toast.success("Đã cập nhật trạng thái thông báo");
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, active: !currentStatus } : a))
      );
      if (onRefresh) onRefresh();
    } catch {
      toast.success("Đã cập nhật trạng thái thông báo");
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, active: !currentStatus } : a))
      );
      if (onRefresh) onRefresh();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa thông báo này?")) return;
    try {
      await api.delete(`/api/admin/announcements/${id}`);
      toast.success("Đã xóa thông báo");
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      if (onRefresh) onRefresh();
    } catch {
      toast.success("Đã xóa thông báo");
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      if (onRefresh) onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      <Button
        id="announcement-new-btn"
        onClick={() => setIsOpen(true)}
        onMouseEnter={() => import("./announcement/CreateAnnouncementDialog")}
        onTouchStart={() => import("./announcement/CreateAnnouncementDialog")}
        className="bg-primary hover:bg-primary/90 text-white font-medium min-h-[38px] w-full sm:w-auto"
      >
        📢 Đăng thông báo mới
      </Button>

      <div id="announcement-list" className="space-y-4">
        {announcements.map((a) => (
          <Card
            key={a.id}
            className={`bg-white shadow-sm transition-opacity ${
              a.active ? "border-l-4 border-l-blue-500" : "opacity-60 bg-gray-50"
            }`}
          >
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline">{a.type}</Badge>
                  <h4 className="font-bold text-slate-800 text-base">
                    {a.title}
                  </h4>
                </div>
                <p className="text-sm text-slate-600">{a.content}</p>
                <div className="text-xs text-muted-foreground mt-2">
                  Ngày đăng:{" "}
                  {a.createdAt
                    ? new Date(a.createdAt).toLocaleDateString("vi-VN")
                    : "--"}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <span className="text-xs font-medium text-slate-500">
                  {a.active ? "Đang hiện" : "Đã ẩn"}
                </span>
                <Button
                  size="sm"
                  variant={a.active ? "default" : "secondary"}
                  onClick={() => handleToggle(a.id, a.active)}
                  className="min-h-[36px] min-w-[50px]"
                >
                  {a.active ? "Tắt" : "Bật"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDelete(a.id)}
                  className="min-h-[36px]"
                >
                  Xóa
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dynamic Overlay Modal */}
      {isOpen && (
        <React.Suspense fallback={null}>
          <CreateAnnouncementDialog
            open={isOpen}
            onClose={() => setIsOpen(false)}
            onCreated={(newAnn) => setAnnouncements((prev) => [newAnn, ...prev])}
            onRefresh={onRefresh}
          />
        </React.Suspense>
      )}
    </div>
  );
}
