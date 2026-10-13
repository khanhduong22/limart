import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Plus } from "lucide-react";
import { Link } from "@/lib/router";
import { REQUEST_TYPES } from "./request-constants";

const CreateRequestModal = React.lazy(() => import("./CreateRequestModal"));

export default function RequestListClient({
  requests = [],
  onRefresh,
}: {
  requests: any[];
  onRefresh?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Yêu cầu / Giải trình</h1>
        </div>
        <Button
          id="create-request-btn"
          size="sm"
          onClick={() => setIsOpen(true)}
          onMouseEnter={() => import("./CreateRequestModal")}
          onTouchStart={() => import("./CreateRequestModal")}
          className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs h-8 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Tạo yêu cầu
        </Button>
      </div>

      {/* Requests List */}
      <div className="space-y-2.5">
        {requests.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="py-12 text-center text-xs text-muted-foreground">
              Bạn chưa có yêu cầu hay giải trình nào.
            </CardContent>
          </Card>
        ) : (
          requests.map((r: any) => (
            <Card key={r.id} className="rounded-2xl shadow-xs border">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-bold">
                      {REQUEST_TYPES.find((t) => t.value === r.type)?.label || r.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {new Date(r.date).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                  <div className="font-semibold text-xs text-gray-800">{r.reason}</div>
                </div>

                <div>
                  {r.status === "PENDING" && (
                    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-[10px] font-bold">
                      Đang chờ duyệt
                    </Badge>
                  )}
                  {r.status === "APPROVED" && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold">
                      Đã duyệt ✅
                    </Badge>
                  )}
                  {r.status === "REJECTED" && (
                    <Badge variant="destructive" className="text-[10px] font-bold">
                      Từ chối ❌
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create Request Modal */}
      {isOpen && (
        <React.Suspense fallback={null}>
          <CreateRequestModal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            onSuccess={() => {
              setIsOpen(false);
              onRefresh?.();
            }}
          />
        </React.Suspense>
      )}
    </div>
  );
}
