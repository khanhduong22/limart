import React, { useState, useMemo } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useTasks,
  useTaskDefinitions,
  useTaskItems,
} from "@/hooks/useAdminData";
import { useAdminStaffTasksStore } from "@/stores/useAdminStaffTasksStore";
import type {
  AdminTaskItem,
  TaskDefinition,
  MarketplaceTaskItem,
} from "@/types";
import {
  ReviewPendingTab,
  TaskHistoryTab,
  TaskDefinitionsTab,
  MarketplaceTab,
  ReviewSubmissionDialog,
  TaskDefinitionDialogs,
  MarketplaceDialogs,
  computeOverduePenalty,
  filterReviewedTasks,
} from "@/components/tasks/wfh";

export function TasksPage() {
  const { tasks, approveTask, reviewTask } = useTasks();
  const {
    definitions,
    isLoading: isLoadingDefs,
    createDefinition,
    updateDefinition,
    toggleActive,
    deleteDefinition,
  } = useTaskDefinitions();
  const {
    items: taskItems,
    isLoading: isLoadingItems,
    createTaskItem,
    resetTaskItem,
    closeTaskItem,
    deleteTaskItem,
  } = useTaskItems();

  const {
    historyMonth,
    setHistoryMonth,
    defSearch,
    setDefSearch,
    defStatusFilter,
    setDefStatusFilter,
    itemSearch,
    setItemSearch,
    itemStatusFilter,
    setItemStatusFilter,
  } = useAdminStaffTasksStore();

  // 1. Pending review list (strictly tasks with status SUBMITTED)
  const pendingTasks = useMemo(() => {
    const list = Array.isArray(tasks) ? tasks : [];
    return list.filter((t) => t.status === "SUBMITTED");
  }, [tasks]);

  // Review Dialog State
  const [reviewingTask, setReviewingTask] = useState<AdminTaskItem | null>(null);
  const [bonusPenalty, setBonusPenalty] = useState(0);
  const [adminNote, setAdminNote] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const openReview = (task: AdminTaskItem) => {
    setReviewingTask(task);
    const penaltyInfo = computeOverduePenalty(task);
    setBonusPenalty(penaltyInfo ? penaltyInfo.penalty : task.bonusPenalty || 0);
    setAdminNote(penaltyInfo ? penaltyInfo.note : task.adminNote || "");
  };

  const handleReviewSubmit = async (decision: "APPROVED" | "REJECTED") => {
    if (!reviewingTask || isSubmittingReview) return;
    setIsSubmittingReview(true);
    try {
      await reviewTask(reviewingTask.id, decision, {
        bonusPenalty,
        adminNote,
      });
      setReviewingTask(null);
      setBonusPenalty(0);
      setAdminNote("");
    } catch {
      // Toast handled by hook
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // 2. History Tab State
  const reviewedTasks = useMemo(() => {
    return filterReviewedTasks(tasks, historyMonth);
  }, [tasks, historyMonth]);

  // 3. Definitions Tab State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    baseReward: 0,
    unit: "",
  });

  const [editingDef, setEditingDef] = useState<TaskDefinition | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    baseReward: 0,
    unit: "",
  });

  const handleCreateDef = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.unit.trim()) {
      toast.error("Vui lòng điền đầy đủ tên và đơn vị tính");
      return;
    }
    setIsSubmittingCreate(true);
    try {
      await createDefinition({
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        baseReward: Number(createForm.baseReward) || 0,
        unit: createForm.unit.trim(),
        active: true,
      });
      setIsCreateOpen(false);
      setCreateForm({ name: "", description: "", baseReward: 0, unit: "" });
    } catch {
      // Toast handled by hook
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const openEditDef = (def: TaskDefinition) => {
    setEditingDef(def);
    setEditForm({
      name: def.name,
      description: def.description || "",
      baseReward: def.baseReward,
      unit: def.unit,
    });
  };

  const handleUpdateDef = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDef) return;
    if (!editForm.name.trim() || !editForm.unit.trim()) {
      toast.error("Vui lòng điền đầy đủ tên và đơn vị tính");
      return;
    }
    setIsSubmittingEdit(true);
    try {
      await updateDefinition(editingDef.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        baseReward: Number(editForm.baseReward) || 0,
        unit: editForm.unit.trim(),
      });
      setEditingDef(null);
    } catch {
      // Toast handled by hook
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteDef = async (id: string) => {
    if (!confirm("Are you sure you want to delete this task definition?")) return;
    try {
      await deleteDefinition(id);
    } catch {
      // Toast handled by hook
    }
  };

  // 4. Marketplace Tab State
  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
  const [isSubmittingCreateItem, setIsSubmittingCreateItem] = useState(false);
  const [createItemForm, setCreateItemForm] = useState({
    taskDefId: "",
    title: "",
    description: "",
    deadline: "",
  });
  const [viewingItem, setViewingItem] = useState<MarketplaceTaskItem | null>(null);

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createItemForm.taskDefId || !createItemForm.title.trim()) {
      toast.error("Please fill in required fields");
      return;
    }
    setIsSubmittingCreateItem(true);
    try {
      await createTaskItem({
        taskDefId: createItemForm.taskDefId,
        title: createItemForm.title.trim(),
        description: createItemForm.description.trim() || undefined,
        deadline: createItemForm.deadline || undefined,
      });
      setIsCreateItemOpen(false);
      setCreateItemForm({
        taskDefId: "",
        title: "",
        description: "",
        deadline: "",
      });
    } catch {
      // Toast handled by hook
    } finally {
      setIsSubmittingCreateItem(false);
    }
  };

  return (
    <div className="container mx-auto py-6 sm:py-8 space-y-6 sm:space-y-8">
      {/* Title */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
          WFH & Packing Management
        </h1>
      </div>

      <Tabs defaultValue="review" className="space-y-6">
        {/* Warm beige rounded tabs bar */}
        <div className="overflow-x-auto no-scrollbar">
          <TabsList className="bg-[#EADFD7] p-1 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-1 w-full max-w-full h-auto border-0">
            <TabsTrigger
              id="tab-trigger-review"
              value="review"
              className="data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-sm text-stone-700 font-medium py-2.5 min-h-[38px] rounded-lg text-xs sm:text-sm transition-all"
            >
              Review Pending ({pendingTasks.length})
            </TabsTrigger>
            <TabsTrigger
              id="tab-trigger-history"
              value="history"
              className="data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-sm text-stone-700 font-medium py-2.5 min-h-[38px] rounded-lg text-xs sm:text-sm transition-all"
            >
              History
            </TabsTrigger>
            <TabsTrigger
              id="tab-trigger-definitions"
              value="definitions"
              className="data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-sm text-stone-700 font-medium py-2.5 min-h-[38px] rounded-lg text-xs sm:text-sm transition-all"
            >
              Task Definitions
            </TabsTrigger>
            <TabsTrigger
              id="tab-trigger-items"
              value="items"
              className="data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-sm text-stone-700 font-medium py-2.5 min-h-[38px] rounded-lg text-xs sm:text-sm transition-all"
            >
              Marketplace ({taskItems.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 1. REVIEW PENDING TAB */}
        <TabsContent value="review">
          <ReviewPendingTab
            pendingTasks={pendingTasks}
            onOpenReview={openReview}
            onQuickApprove={approveTask}
          />
        </TabsContent>

        {/* 2. HISTORY TAB */}
        <TabsContent value="history">
          <TaskHistoryTab
            reviewedTasks={reviewedTasks}
            historyMonth={historyMonth}
            onHistoryMonthChange={setHistoryMonth}
          />
        </TabsContent>

        {/* 3. TASK DEFINITIONS TAB */}
        <TabsContent value="definitions">
          <TaskDefinitionsTab
            definitions={definitions}
            isLoadingDefs={isLoadingDefs}
            defSearch={defSearch}
            onDefSearchChange={setDefSearch}
            defStatusFilter={defStatusFilter}
            onDefStatusFilterChange={setDefStatusFilter}
            onOpenCreate={() => setIsCreateOpen(true)}
            onOpenEdit={openEditDef}
            onToggleActive={toggleActive}
            onDeleteDef={handleDeleteDef}
          />
        </TabsContent>

        {/* 4. MARKETPLACE TAB */}
        <TabsContent value="items">
          <MarketplaceTab
            taskItems={taskItems}
            isLoadingItems={isLoadingItems}
            itemSearch={itemSearch}
            onItemSearchChange={setItemSearch}
            itemStatusFilter={itemStatusFilter}
            onItemStatusFilterChange={setItemStatusFilter}
            onOpenCreateItem={() => setIsCreateItemOpen(true)}
            onViewItem={setViewingItem}
            onCloseItem={closeTaskItem}
            onResetItem={resetTaskItem}
            onDeleteItem={deleteTaskItem}
          />
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <ReviewSubmissionDialog
        reviewingTask={reviewingTask}
        bonusPenalty={bonusPenalty}
        onBonusPenaltyChange={setBonusPenalty}
        adminNote={adminNote}
        onAdminNoteChange={setAdminNote}
        isSubmittingReview={isSubmittingReview}
        onClose={() => setReviewingTask(null)}
        onSubmitReview={handleReviewSubmit}
      />

      {/* Task Definition Create & Edit Dialogs */}
      <TaskDefinitionDialogs
        isCreateOpen={isCreateOpen}
        onCloseCreate={() => setIsCreateOpen(false)}
        createForm={createForm}
        onCreateFormChange={setCreateForm}
        isSubmittingCreate={isSubmittingCreate}
        onSubmitCreate={handleCreateDef}
        editingDef={editingDef}
        onCloseEdit={() => setEditingDef(null)}
        editForm={editForm}
        onEditFormChange={setEditForm}
        isSubmittingEdit={isSubmittingEdit}
        onSubmitEdit={handleUpdateDef}
      />

      {/* Post Task Item & View Task Item Dialogs */}
      <MarketplaceDialogs
        isCreateItemOpen={isCreateItemOpen}
        onCloseCreateItem={() => setIsCreateItemOpen(false)}
        createItemForm={createItemForm}
        onCreateItemFormChange={setCreateItemForm}
        definitions={definitions}
        isSubmittingCreateItem={isSubmittingCreateItem}
        onSubmitCreateItem={handleCreateItem}
        viewingItem={viewingItem}
        onCloseViewingItem={() => setViewingItem(null)}
      />
    </div>
  );
}

export default TasksPage;
