import React, { useMemo } from "react";
import { Plus, Search, Filter, Pencil, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import type { TaskDefinition } from "@/types";

export interface TaskDefinitionsTabProps {
  definitions: TaskDefinition[];
  isLoadingDefs: boolean;
  defSearch: string;
  onDefSearchChange: (val: string) => void;
  defStatusFilter: "ALL" | "ACTIVE" | "INACTIVE";
  onDefStatusFilterChange: (val: "ALL" | "ACTIVE" | "INACTIVE") => void;
  onOpenCreate: () => void;
  onOpenEdit: (def: TaskDefinition) => void;
  onToggleActive: (def: TaskDefinition) => Promise<void> | void;
  onDeleteDef: (id: string) => Promise<void> | void;
}

export function TaskDefinitionsTab({
  definitions,
  isLoadingDefs,
  defSearch,
  onDefSearchChange,
  defStatusFilter,
  onDefStatusFilterChange,
  onOpenCreate,
  onOpenEdit,
  onToggleActive,
  onDeleteDef,
}: TaskDefinitionsTabProps) {
  const filteredDefinitions = useMemo(() => {
    return definitions.filter((d) => {
      const matchStatus =
        defStatusFilter === "ALL"
          ? true
          : defStatusFilter === "ACTIVE"
          ? d.active
          : !d.active;

      const q = defSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        d.name.toLowerCase().includes(q) ||
        (d.description && d.description.toLowerCase().includes(q)) ||
        d.unit.toLowerCase().includes(q);

      return matchStatus && matchSearch;
    });
  }, [definitions, defSearch, defStatusFilter]);

  return (
    <Card className="bg-white border border-stone-200/80 shadow-sm rounded-2xl">
      <CardHeader className="space-y-1 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-bold text-stone-900">
              Task Definitions
            </CardTitle>
            <CardDescription className="text-stone-500 text-sm">
              Manage available tasks, prices, and units.
            </CardDescription>
          </div>
          <Button
            onClick={onOpenCreate}
            className="bg-[#8B5E3C] hover:bg-[#724C30] text-white text-xs h-9 rounded-lg"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add Task
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-stone-50/60 p-3 rounded-xl border border-stone-200">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <Input
              placeholder="Search task name, unit, description..."
              value={defSearch}
              onChange={(e) => onDefSearchChange(e.target.value)}
              className="pl-9 bg-white border-stone-200 h-10 sm:h-9 text-base sm:text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-stone-400" />
            <select
              value={defStatusFilter}
              onChange={(e) => onDefStatusFilterChange(e.target.value as any)}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 h-10 sm:h-9 text-base sm:text-xs text-stone-700 shadow-sm"
              aria-label="Filter task definitions status"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>

        {filteredDefinitions.length === 0 ? (
          <div className="py-12 text-center text-stone-500 font-medium">
            {isLoadingDefs
              ? "Loading task definitions..."
              : "No task definitions found."}
          </div>
        ) : (
          <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch] rounded-xl border border-stone-200/80">
            <Table className="w-full min-w-[600px]">
              <TableHeader className="bg-stone-50/60">
                <TableRow className="border-b border-stone-200 hover:bg-transparent">
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Name
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Unit
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Reward
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5">
                    Status
                  </TableHead>
                  <TableHead className="font-semibold text-stone-600 text-xs py-3.5 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDefinitions.map((task) => (
                  <TableRow
                    key={task.id}
                    className="border-b border-stone-100 hover:bg-stone-50/70 transition-colors"
                  >
                    <TableCell className="font-medium text-stone-900 py-3.5">
                      <div>
                        <div className="font-semibold text-stone-900 text-sm">
                          {task.name}
                        </div>
                        {task.description && (
                          <div className="text-xs text-stone-500 mt-0.5 line-clamp-1">
                            {task.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <Badge
                        variant="outline"
                        className="font-mono text-xs bg-stone-50 border-stone-300 text-stone-700"
                      >
                        {task.unit}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-bold text-stone-900 text-sm py-3.5 font-mono">
                      {task.baseReward.toLocaleString()} đ
                    </TableCell>
                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={task.active}
                          onCheckedChange={() => onToggleActive(task)}
                        />
                        <span className="text-xs font-medium text-stone-600">
                          {task.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-1.5 py-3.5">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-stone-700 hover:text-stone-900 border-stone-200"
                        onClick={() => onOpenEdit(task)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        onClick={() => onDeleteDef(task.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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
