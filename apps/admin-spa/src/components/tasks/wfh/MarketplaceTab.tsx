import React, { useMemo } from "react";
import { format } from "date-fns";
import { Plus, Search, Filter, Eye, XCircle, RotateCcw, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { MarketplaceTaskItem } from "@/types";

export interface MarketplaceTabProps {
  taskItems: MarketplaceTaskItem[];
  isLoadingItems: boolean;
  itemSearch: string;
  onItemSearchChange: (val: string) => void;
  itemStatusFilter: "ALL" | "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CLOSED";
  onItemStatusFilterChange: (
    val: "ALL" | "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CLOSED"
  ) => void;
  onOpenCreateItem: () => void;
  onViewItem: (item: MarketplaceTaskItem) => void;
  onCloseItem: (id: string) => Promise<void> | void;
  onResetItem: (id: string) => Promise<void> | void;
  onDeleteItem: (id: string) => Promise<void> | void;
}

export function MarketplaceTab({
  taskItems,
  isLoadingItems,
  itemSearch,
  onItemSearchChange,
  itemStatusFilter,
  onItemStatusFilterChange,
  onOpenCreateItem,
  onViewItem,
  onCloseItem,
  onResetItem,
  onDeleteItem,
}: MarketplaceTabProps) {
  const filteredTaskItems = useMemo(() => {
    const list = Array.isArray(taskItems) ? taskItems : [];
    return list.filter((item) => {
      const matchStatus =
        itemStatusFilter === "ALL" ? true : item.status === itemStatusFilter;

      const q = itemSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.taskDefinition?.name &&
          item.taskDefinition.name.toLowerCase().includes(q)) ||
        (item.assignee?.name && item.assignee.name.toLowerCase().includes(q));

      return matchStatus && matchSearch;
    });
  }, [taskItems, itemSearch, itemStatusFilter]);

  return (
    <Card className="bg-white border border-stone-200/80 shadow-sm rounded-2xl">
      <CardHeader className="space-y-1 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-bold text-stone-900">
              Marketplace Items
            </CardTitle>
            <CardDescription className="text-stone-500 text-sm">
              Post specific one-time jobs for employees to claim.
            </CardDescription>
          </div>
          <Button
            onClick={onOpenCreateItem}
            className="bg-[#8B5E3C] hover:bg-[#724C30] text-white text-xs h-9 rounded-lg"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Post New Task
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-stone-50/60 p-3 rounded-xl border border-stone-200">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <Input
              placeholder="Search title, description, assignee..."
              value={itemSearch}
              onChange={(e) => onItemSearchChange(e.target.value)}
              className="pl-9 bg-white border-stone-200 h-10 sm:h-9 text-base sm:text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-stone-400" />
            <select
              value={itemStatusFilter}
              onChange={(e) => onItemStatusFilterChange(e.target.value as any)}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 h-10 sm:h-9 text-base sm:text-xs text-stone-700 shadow-sm"
              aria-label="Filter marketplace tasks status"
            >
              <option value="ALL">All Status</option>
              <option value="OPEN">OPEN</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>
        </div>

        {filteredTaskItems.length === 0 ? (
          <div className="py-12 text-center text-stone-500 font-medium">
            {isLoadingItems
              ? "Loading marketplace items..."
              : "No marketplace tasks found."}
          </div>
        ) : (
          <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch] rounded-xl border border-stone-200/80">
            <Table className="w-full min-w-[700px]">
              <TableHeader className="bg-stone-50/60">
                <TableRow className="border-b border-stone-200 hover:bg-transparent">
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Title
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Type
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Reward
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Assignee
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Status
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Deadline
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTaskItems.map((item) => (
                  <TableRow
                    key={item.id}
                    className="border-b border-stone-100 hover:bg-stone-50/70 transition-colors"
                  >
                    <TableCell className="font-medium text-stone-900 py-3.5">
                      <button
                        type="button"
                        className="text-left hover:underline hover:text-stone-900 flex flex-col items-start group"
                        onClick={() => onViewItem(item)}
                      >
                        <span className="flex items-center gap-1 font-semibold text-stone-900 text-sm">
                          {item.title}
                          <Eye className="h-3.5 w-3.5 opacity-0 group-hover:opacity-70 transition-opacity text-stone-500" />
                        </span>
                        {item.description && (
                          <span className="text-xs text-stone-500 line-clamp-1 max-w-[260px] mt-0.5">
                            {item.description}
                          </span>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="py-3.5 text-xs text-stone-700">
                      {item.taskDefinition?.name || "—"}
                    </TableCell>
                    <TableCell className="font-bold text-stone-900 text-sm font-mono py-3.5">
                      {item.taskDefinition?.baseReward.toLocaleString()} đ
                    </TableCell>
                    <TableCell className="py-3.5 text-xs text-stone-800">
                      {item.assignee?.name || (
                        <span className="text-stone-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <Badge
                        variant={
                          item.status === "OPEN"
                            ? "default"
                            : item.status === "IN_PROGRESS"
                            ? "secondary"
                            : "outline"
                        }
                        className={
                          item.status === "OPEN"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : item.status === "IN_PROGRESS"
                            ? "bg-blue-100 text-blue-800 border-blue-200"
                            : "bg-stone-100 text-stone-600 border-stone-200"
                        }
                      >
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-stone-600 font-mono py-3.5">
                      {item.deadline
                        ? format(new Date(item.deadline), "dd/MM/yyyy HH:mm")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-1.5 whitespace-nowrap py-3.5">
                      {item.status === "OPEN" && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-200"
                          onClick={() => onCloseItem(item.id)}
                          title="Close Task"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {item.status === "IN_PROGRESS" && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                          onClick={() => onResetItem(item.id)}
                          title="Reset về OPEN (cho nhận lại)"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        onClick={() => onDeleteItem(item.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
