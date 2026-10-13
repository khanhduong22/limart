import React from "react";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import DeletePrizeButton from "@/components/admin/DeletePrizeButton";
import { useEmployees } from "@/hooks/useAdminData";

const AllowedUsersManagerClient = React.lazy(
  () => import("@/components/admin/AllowedUsersManagerClient")
);
const LuckyWheelHistoryClient = React.lazy(
  () => import("@/components/admin/LuckyWheelHistoryClient")
);
const PrizeDialog = React.lazy(
  () => import("@/components/admin/PrizeDialog")
);

export function LuckyWheelPage() {
  const { employees } = useEmployees();
  const { data, mutate } = useAdminQuery<{ prizes: any[]; history: any[] }>(
    "/api/admin/lucky-wheel"
  );

  const prizes = data?.prizes || [];
  const history = data?.history || [];

  const f = (n: number) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(n || 0);

  const availablePrizes = prizes.filter((p) => p.remaining > 0);
  const outOfStockPrizes = prizes.filter((p) => p.remaining === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Vòng quay may mắn
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Cấu hình kho giải thưởng, tỷ lệ trúng và danh sách nhân sự được phép quay
          </p>
        </div>
        <div className="w-full sm:w-auto flex justify-end">
          <React.Suspense fallback={null}>
            <PrizeDialog
              onSaved={() => {
                mutate();
              }}
            />
          </React.Suspense>
        </div>
      </div>

      {/* Reward Audit Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Available Loot */}
        <Card
          id="lucky-wheel-available"
          className="md:col-span-2 border-emerald-200 bg-emerald-50/30"
        >
          <CardHeader>
            <CardTitle className="text-emerald-700 flex items-center gap-2 text-base font-bold">
              🎁 Kho Quà Đang Có Sẵn
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {availablePrizes.length === 0 ? (
                <span className="text-muted-foreground italic text-sm">
                  Kho đang rỗng!
                </span>
              ) : (
                availablePrizes.map((p) => (
                  <Badge
                    key={p.id}
                    variant="outline"
                    className="text-xs py-1 px-3 bg-white border-emerald-200 text-emerald-800 shadow-sm"
                  >
                    {p.name}
                    <span className="ml-2 bg-emerald-100 text-emerald-700 rounded-full px-2 text-[10px] font-bold">
                      x{p.remaining}
                    </span>
                  </Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Out of Stock */}
        <Card
          id="lucky-wheel-out-of-stock"
          className="border-gray-200 bg-gray-50/50"
        >
          <CardHeader>
            <CardTitle className="text-gray-600 flex items-center gap-2 text-base font-bold">
              🚫 Đã Hết / Đã Trao
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {outOfStockPrizes.length === 0 ? (
                <span className="text-muted-foreground italic text-sm">
                  Chưa có món nào hết hàng.
                </span>
              ) : (
                outOfStockPrizes.map((p) => (
                  <Badge
                    key={p.id}
                    variant="secondary"
                    className="text-xs py-1 px-3 text-gray-500 line-through"
                  >
                    {p.name}
                  </Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Allowed Users Manager */}
      <React.Suspense fallback={null}>
        <AllowedUsersManagerClient
          users={employees.map((e) => ({
            id: e.id,
            name: e.name,
            email: e.email,
            luckyWheelAllowed: true,
          }))}
        />
      </React.Suspense>

      {/* Prizes Table */}
      <Card id="lucky-wheel-prizes-list" className="bg-white">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl font-bold">Danh sách giải thưởng</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Tên giải</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead className="text-right">Giá trị</TableHead>
                  <TableHead className="text-right">Tổng SL</TableHead>
                  <TableHead className="text-right">Còn lại</TableHead>
                  <TableHead className="text-right">Tỷ lệ</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prizes.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Chưa có giải thưởng nào. Nhấn &quot;Thêm giải thưởng&quot; để tạo mới.
                    </TableCell>
                  </TableRow>
                ) : (
                  prizes.map((prize) => (
                    <TableRow key={prize.id}>
                      <TableCell className="font-medium">
                        {prize.name}
                        {prize.description && (
                          <div className="text-xs text-muted-foreground">
                            {prize.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{prize.type}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {f(prize.value || 0)}
                      </TableCell>
                      <TableCell className="text-right">{prize.quantity}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-600">
                        {prize.remaining}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {prize.probability}%
                      </TableCell>
                      <TableCell>
                        {prize.active ? (
                          <Badge className="bg-emerald-600 text-white">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Hidden</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <React.Suspense fallback={null}>
                          <PrizeDialog prize={prize} onSaved={() => mutate()} />
                        </React.Suspense>
                        <DeletePrizeButton
                          prizeId={prize.id}
                          onDeleted={() => mutate()}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Lucky Wheel History */}
      <React.Suspense fallback={null}>
        <LuckyWheelHistoryClient initialHistory={history} />
      </React.Suspense>
    </div>
  );
}
