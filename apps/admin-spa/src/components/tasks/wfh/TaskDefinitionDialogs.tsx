import React from "react";
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
import type { TaskDefinition } from "@/types";

export interface TaskDefinitionFormData {
  name: string;
  description: string;
  baseReward: number;
  unit: string;
}

export interface TaskDefinitionDialogsProps {
  isCreateOpen: boolean;
  onCloseCreate: () => void;
  createForm: TaskDefinitionFormData;
  onCreateFormChange: (form: TaskDefinitionFormData) => void;
  isSubmittingCreate: boolean;
  onSubmitCreate: (e: React.FormEvent) => Promise<void> | void;

  editingDef: TaskDefinition | null;
  onCloseEdit: () => void;
  editForm: TaskDefinitionFormData;
  onEditFormChange: (form: TaskDefinitionFormData) => void;
  isSubmittingEdit: boolean;
  onSubmitEdit: (e: React.FormEvent) => Promise<void> | void;
}

export function TaskDefinitionDialogs({
  isCreateOpen,
  onCloseCreate,
  createForm,
  onCreateFormChange,
  isSubmittingCreate,
  onSubmitCreate,
  editingDef,
  onCloseEdit,
  editForm,
  onEditFormChange,
  isSubmittingEdit,
  onSubmitEdit,
}: TaskDefinitionDialogsProps) {
  return (
    <>
      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => !open && onCloseCreate()}>
        <DialogContent className="bg-white border border-stone-200 rounded-2xl shadow-xl">
          <form onSubmit={onSubmitCreate}>
            <DialogHeader>
              <DialogTitle className="text-stone-900 font-bold">
                Create New Task Definition
              </DialogTitle>
              <DialogDescription className="text-stone-500 text-xs">
                Define a new task that users can perform.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="wfh-create-name" className="text-right text-xs text-stone-700">
                  Name
                </Label>
                <Input
                  id="wfh-create-name"
                  value={createForm.name}
                  onChange={(e) =>
                    onCreateFormChange({ ...createForm, name: e.target.value })
                  }
                  className="col-span-3 bg-white border-stone-200"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="wfh-create-unit" className="text-right text-xs text-stone-700">
                  Unit
                </Label>
                <Input
                  id="wfh-create-unit"
                  placeholder="e.g. bài, video, điểm"
                  value={createForm.unit}
                  onChange={(e) =>
                    onCreateFormChange({ ...createForm, unit: e.target.value })
                  }
                  className="col-span-3 bg-white border-stone-200"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label
                  htmlFor="wfh-create-reward"
                  className="text-right text-xs text-stone-700"
                >
                  Reward (VND)
                </Label>
                <Input
                  id="wfh-create-reward"
                  type="number"
                  min="0"
                  value={createForm.baseReward}
                  onChange={(e) =>
                    onCreateFormChange({
                      ...createForm,
                      baseReward: Number(e.target.value),
                    })
                  }
                  className="col-span-3 bg-white border-stone-200"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label
                  htmlFor="wfh-create-desc"
                  className="text-right text-xs text-stone-700 pt-2"
                >
                  Description
                </Label>
                <Input
                  id="wfh-create-desc"
                  value={createForm.description}
                  onChange={(e) =>
                    onCreateFormChange({
                      ...createForm,
                      description: e.target.value,
                    })
                  }
                  className="col-span-3 bg-white border-stone-200"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={isSubmittingCreate}
                className="bg-[#8B5E3C] hover:bg-[#724C30] text-white text-xs"
              >
                {isSubmittingCreate ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={Boolean(editingDef)} onOpenChange={(open) => !open && onCloseEdit()}>
        <DialogContent className="bg-white border border-stone-200 rounded-2xl shadow-xl">
          <form onSubmit={onSubmitEdit}>
            <DialogHeader>
              <DialogTitle className="text-stone-900 font-bold">
                Edit Task Definition
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label
                  htmlFor="wfh-edit-name"
                  className="text-right text-xs text-stone-700"
                >
                  Name
                </Label>
                <Input
                  id="wfh-edit-name"
                  value={editForm.name}
                  onChange={(e) =>
                    onEditFormChange({ ...editForm, name: e.target.value })
                  }
                  className="col-span-3 bg-white border-stone-200"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label
                  htmlFor="wfh-edit-unit"
                  className="text-right text-xs text-stone-700"
                >
                  Unit
                </Label>
                <Input
                  id="wfh-edit-unit"
                  value={editForm.unit}
                  onChange={(e) =>
                    onEditFormChange({ ...editForm, unit: e.target.value })
                  }
                  className="col-span-3 bg-white border-stone-200"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label
                  htmlFor="wfh-edit-reward"
                  className="text-right text-xs text-stone-700"
                >
                  Reward
                </Label>
                <Input
                  id="wfh-edit-reward"
                  type="number"
                  min="0"
                  value={editForm.baseReward}
                  onChange={(e) =>
                    onEditFormChange({
                      ...editForm,
                      baseReward: Number(e.target.value),
                    })
                  }
                  className="col-span-3 bg-white border-stone-200"
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label
                  htmlFor="wfh-edit-desc"
                  className="text-right text-xs text-stone-700 pt-2"
                >
                  Description
                </Label>
                <Input
                  id="wfh-edit-desc"
                  value={editForm.description}
                  onChange={(e) =>
                    onEditFormChange({
                      ...editForm,
                      description: e.target.value,
                    })
                  }
                  className="col-span-3 bg-white border-stone-200"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={isSubmittingEdit}
                className="bg-[#8B5E3C] hover:bg-[#724C30] text-white text-xs"
              >
                {isSubmittingEdit ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default TaskDefinitionDialogs;
