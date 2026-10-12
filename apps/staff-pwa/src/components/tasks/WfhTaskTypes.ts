export interface MarketItem {
  id: string;
  title: string;
  description?: string;
  status: string;
  taskDefinition?: {
    id: string;
    name?: string;
    title?: string;
    baseReward: number;
    unit: string;
  };
  taskDef?: {
    id: string;
    name?: string;
    title?: string;
    baseReward: number;
    unit: string;
  };
}

export interface TaskDefItem {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  baseReward: number;
  unit: string;
  category?: string;
}

export interface UserTaskRecord {
  id: string;
  status: "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";
  quantity: number;
  unitPrice: number;
  finalAmount?: number;
  evidenceLink?: string;
  note?: string;
  rejectReason?: string;
  adminNote?: string;
  createdAt: string;
  submittedAt?: string;
  taskDefinition?: {
    name?: string;
    title?: string;
    unit?: string;
    baseReward?: number;
  };
  taskDef?: {
    name?: string;
    title?: string;
    unit?: string;
    baseReward?: number;
  };
  taskItem?: {
    name?: string;
    title?: string;
  };
}

export interface SubmittingWfhTask {
  userTaskId?: string;
  taskDefId?: string;
  title: string;
  unit: string;
}
