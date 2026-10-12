import React from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { HeadlessCombobox } from "@/components/ui/headless-combobox";
import type { TaskDefinition, MarketplaceTaskItem } from "@/types";

export interface MarketplaceItemFormData {
  taskDefId: string;
  title: string;
  description: string;
  deadline: string;
}

export interface MarketplaceDialogsProps {
  isCreateItemOpen: boolean;
  onCloseCreateItem: () => void;
  createItemForm: MarketplaceItemFormData;
  onCreateItemFormChange: (form: MarketplaceItemFormData) => void;
  definitions: TaskDefinition[];
  isSubmittingCreateItem: boolean;
  onSubmitCreateItem: (e: React.FormEvent) => Promise<void> | void;

  viewingItem: MarketplaceTaskItem | null;
  onCloseViewingItem: () => void;
}

export function MarketplaceDialogs({
  isCreateItemOpen,
  onCloseCreateItem,
  createItemForm,
  onCreateItemFormChange,
  definitions,
  isSubmittingCreateItem,
  onSubmitCreateItem,
  viewingItem,
  onCloseViewingItem,
}: MarketplaceDialogsProps) {
  return (
    <>
      {/* Post Task Item Dialog */}
      <Dialog open={isCreateItemOpen} onOpenChange={(open) => !open && onCloseCreateItem()}>
        <DialogContent className="sm:max-w-2xl bg-white border border-stone-200 rounded-2xl shadow-xl">
          <form onSubmit={onSubmitCreateItem}>
            <DialogHeader>
              <DialogTitle className="text-stone-900 font-bold">
                Post a Task Item
              </DialogTitle>
              <DialogDescription className="text-stone-500 text-xs">
                Create a specific job for users to claim.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right text-xs text-stone-700">
                  Task Type
                </Label>
                <div className="col-span-3">
                  <HeadlessCombobox
                    items={definitions}
                    value={createItemForm.taskDefId}
                    onChange={(val) =>
                      onCreateItemFormChange({ ...createItemForm, taskDefId: val })
                    }
                    valueKey="id"
                    displayKey="name"
                    placeholder="Select a task type"
                    renderOption={(item) => (
                      <span className="flex justify-between w-full">
                        <span>{item.name}</span>
                        <span className="text-stone-500 text-xs ml-2 font-mono">
                          {item.baseReward.toLocaleString()}đ / {item.unit}
                        </span>
                      </span>
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label
                  htmlFor="marketplace-item-title"
                  className="text-right text-xs text-stone-700"
                >
                  Title
                </Label>
                <Input
                  id="marketplace-item-title"
                  value={createItemForm.title}
                  onChange={(e) =>
                    onCreateItemFormChange({
                      ...createItemForm,
                      title: e.target.value,
                    })
                  }
                  className="col-span-3 bg-white border-stone-200"
                  placeholder="e.g. Fix bug #123"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label
                  htmlFor="marketplace-item-deadline"
                  className="text-right text-xs text-stone-700"
                >
                  Deadline
                </Label>
                <Input
                  id="marketplace-item-deadline"
                  type="datetime-local"
                  value={createItemForm.deadline}
                  onChange={(e) =>
                    onCreateItemFormChange({
                      ...createItemForm,
                      deadline: e.target.value,
                    })
                  }
                  className="col-span-3 bg-white border-stone-200"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label
                  htmlFor="marketplace-item-desc"
                  className="text-right text-xs text-stone-700 pt-2"
                >
                  Description
                </Label>
                <Textarea
                  id="marketplace-item-desc"
                  value={createItemForm.description}
                  onChange={(e) =>
                    onCreateItemFormChange({
                      ...createItemForm,
                      description: e.target.value,
                    })
                  }
                  className="col-span-3 bg-white border-stone-200"
                  placeholder="Details about this specific task..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={isSubmittingCreateItem}
                className="bg-[#8B5E3C] hover:bg-[#724C30] text-white text-xs"
              >
                {isSubmittingCreateItem ? "Posting..." : "Post Task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Task Item Detail Dialog */}
      <Dialog
        open={Boolean(viewingItem)}
        onOpenChange={(open) => !open && onCloseViewingItem()}
      >
        <DialogContent className="sm:max-w-lg bg-white border border-stone-200 rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-stone-900 leading-snug">
              {viewingItem?.title}
            </DialogTitle>
            <DialogDescription asChild>
              <span className="inline-flex items-center gap-1 text-xs bg-stone-100 text-stone-800 rounded px-2 py-0.5 mt-1 font-medium">
                {viewingItem?.taskDefinition?.name || "Nhiệm vụ"}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-stone-800">
            {viewingItem?.description ? (
              <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-sm whitespace-pre-wrap leading-relaxed text-stone-700">
                {viewingItem.description}
              </div>
            ) : (
              <p className="text-sm text-stone-500 italic">
                Không có mô tả chi tiết.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 text-sm border-t border-stone-200 pt-3">
              <div>
                <span className="text-stone-500 text-xs block">Reward:</span>
                <span className="font-semibold text-emerald-600 font-mono">
                  {viewingItem?.taskDefinition?.baseReward.toLocaleString()} đ
                </span>
              </div>
              <div>
                <span className="text-stone-500 text-xs block">Assignee:</span>
                <span className="font-semibold text-stone-900">
                  {viewingItem?.assignee?.name || "—"}
                </span>
              </div>
              <div>
                <span className="text-stone-500 text-xs block">Status:</span>
                <Badge
                  variant={
                    viewingItem?.status === "OPEN"
                      ? "default"
                      : viewingItem?.status === "IN_PROGRESS"
                      ? "secondary"
                      : "outline"
                  }
                  className="mt-0.5"
                >
                  {viewingItem?.status}
                </Badge>
              </div>
              <div>
                <span className="text-stone-500 text-xs block">Deadline:</span>
                <span className="text-stone-900 text-xs font-mono">
                  {viewingItem?.deadline
                    ? format(new Date(viewingItem.deadline), "dd/MM/yyyy HH:mm")
                    : "—"}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={onCloseViewingItem}
              className="text-xs"
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
