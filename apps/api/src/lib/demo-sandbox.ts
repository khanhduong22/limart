import { PrismaClient, prisma as defaultPrisma } from "@checkin/db";
import { getRedisClient, invalidateCachePattern } from "./cache";
import { VN_OFFSET_MS } from "./date-utils";

export interface DemoModulesConfig {
  attendance: boolean; // Chấm công, Lịch ca & Duyệt đơn (Core)
  piecework: boolean; // Khoán Đóng gói, Bốc vác & Chợ WFH
  operations: boolean; // Giao việc Ca, Checklist Quản lý & KPI
  payroll: boolean; // Tự động Tính lương & Phiếu lương
  gamification: boolean; // Vòng quay may mắn, Gacha & Thành tích
  ai_sop: boolean; // Trợ lý AI Nội quy (Capy RAG + TTS)
}

export const DEFAULT_DEMO_MODULES: DemoModulesConfig = {
  attendance: true,
  piecework: true,
  operations: true,
  payroll: true,
  gamification: true,
  ai_sop: true,
};

export const DEMO_MODULE_METADATA = [
  {
    key: "attendance" as const,
    label: "Chấm công, Lịch ca & Duyệt đơn (Core)",
    description: "Check-in WiFi/GPS, đăng ký lịch ca, đổi ca & duyệt đơn nghỉ phép",
  },
  {
    key: "piecework" as const,
    label: "Khoán Đóng gói, Bốc vác & Chợ WFH",
    description: "Tính tiền theo sản lượng đóng gói, bốc vác và nhận việc WFH",
  },
  {
    key: "operations" as const,
    label: "Giao việc Ca, Checklist Quản lý & KPI",
    description: "Checklist mở/đóng ca, giao việc nhân viên & ma trận Eisenhower",
  },
  {
    key: "payroll" as const,
    label: "Tự động Tính lương & Phiếu lương",
    description: "Tự động tổng hợp công, thưởng chuyên cần, KPI & chốt phiếu lương",
  },
  {
    key: "gamification" as const,
    label: "Vòng quay may mắn, Gacha & Thành tích",
    description: "Game hóa động lực đi làm đúng giờ, mở túi mù & huy hiệu",
  },
  {
    key: "ai_sop" as const,
    label: "Trợ lý AI Nội quy (Capy RAG + TTS)",
    description: "Hỏi đáp quy trình vận hành cửa hàng bằng AI & giọng đọc TTS",
  },
];

export const DEMO_MODULES_REDIS_KEY = "demo:modules:config";

let memoryModulesConfig: DemoModulesConfig = { ...DEFAULT_DEMO_MODULES };

export function _resetDemoModulesMemory(): void {
  memoryModulesConfig = { ...DEFAULT_DEMO_MODULES };
}

export function isDemoSandboxEnabled(): boolean {
  return process.env.DEMO_SANDBOX_MODE === "true";
}

export async function getDemoModulesConfig(): Promise<DemoModulesConfig> {
  try {
    const redis = getRedisClient();
    if (redis) {
      const raw = await redis.get(DEMO_MODULES_REDIS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          attendance: parsed.attendance ?? true,
          piecework: parsed.piecework ?? true,
          operations: parsed.operations ?? true,
          payroll: parsed.payroll ?? true,
          gamification: parsed.gamification ?? true,
          ai_sop: parsed.ai_sop ?? true,
        };
      }
    }
  } catch {
    // Fallback to in-memory config
  }
  return { ...memoryModulesConfig };
}

export async function updateDemoModulesConfig(
  updates: Partial<DemoModulesConfig> | undefined | null
): Promise<DemoModulesConfig> {
  const current = await getDemoModulesConfig();
  const next: DemoModulesConfig = {
    attendance: typeof updates?.attendance === "boolean" ? updates.attendance : current.attendance,
    piecework: typeof updates?.piecework === "boolean" ? updates.piecework : current.piecework,
    operations: typeof updates?.operations === "boolean" ? updates.operations : current.operations,
    payroll: typeof updates?.payroll === "boolean" ? updates.payroll : current.payroll,
    gamification:
      typeof updates?.gamification === "boolean" ? updates.gamification : current.gamification,
    ai_sop: typeof updates?.ai_sop === "boolean" ? updates.ai_sop : current.ai_sop,
  };

  memoryModulesConfig = { ...next };

  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.set(DEMO_MODULES_REDIS_KEY, JSON.stringify(next));
    }
  } catch {
    // Keep in-memory state if Redis write fails
  }

  return next;
}

export const DEMO_STAFF_NAMES = [
  "Lê Hoàng Nam",
  "Phạm Thảo Vy",
  "Đặng Quốc Bảo",
  "Vũ Minh Châu",
  "Hoàng Gia Huy",
  "Ngô Khánh Linh",
  "Bùi Tuấn Kiệt",
  "Đỗ Ngọc Ánh",
  "Lý Gia Hân",
  "Trương Đức Anh",
  "Phan Thanh Trúc",
  "Đinh Quang Minh",
  "Hồ Phương Thảo",
  "Dương Tuấn Anh",
  "Mai Khánh Ngân",
  "Lương Hải Đăng",
  "Tạ Ngọc Diệp",
  "Chu Minh Quân",
  "Võ Thanh Hà",
  "Nguyễn Bảo Trâm",
];

export const PART_TIME_RATES = [23000, 24000, 25000, 26000, 28000, 30000, 32000, 35000];
export const FULL_TIME_SALARIES = [
  7000000, 7500000, 8000000, 8500000, 9000000, 9500000, 10500000,
];
export const DEMO_ADJUSTMENT_AMOUNTS = [100000, 150000, 200000, 300000];
export const DEMO_ADJUSTMENT_REASONS = [
  "Thưởng vượt KPI đóng gói",
  "Thưởng chuyên cần",
  "Thưởng hỗ trợ kiểm kho ca tối",
  "Thưởng doanh số bán hàng xuất sắc",
];
export const DEMO_REQUEST_REASONS = [
  "Xin nghỉ phép giải quyết việc gia đình",
  "Xin đổi ca chiều sang ca sáng",
  "Xin làm việc từ xa (WFH) xử lý đơn hàng online",
  "Xin nghỉ phép khám sức khỏe định kỳ",
];

export function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sanitizes free-text strings by scrubbing brand names, emails, phone numbers,
 * external URLs, and mapped real employee names.
 */
export function sanitizeText(
  input: string | null | undefined,
  nameMap?: Map<string, string>
): string {
  if (!input) return "";

  let output = String(input);

  // 1. Replace URLs with placeholder first so brand replacement does not mutate the safe demo URL
  const URL_PLACEHOLDER = "__DEMO_SAFE_ASSET_URL__";
  output = output.replace(/https?:\/\/[^\s)"']+/gi, URL_PLACEHOLDER);

  // 2. Replace any email addresses
  output = output.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "contact@demomart.vn"
  );

  // 3. Replace Vietnamese phone numbers (0\d{8,10})
  output = output.replace(/(?<!\d)0\d{8,10}(?!\d)/g, "0901234567");

  // 4. Replace real user names from nameMap (longest keys first)
  if (nameMap && nameMap.size > 0) {
    const entries = Array.from(nameMap.entries())
      .filter(([orig]) => orig && orig.trim().length >= 2)
      .sort((a, b) => b[0].length - a[0].length);

    for (const [origName, demoName] of entries) {
      const pattern = new RegExp(escapeRegExp(origName.trim()), "gi");
      output = output.replace(pattern, demoName);
    }
  }

  // 5. Replace case-insensitive "LimArt" / "Lim Art" / "limart" with "DemoMart"
  output = output.replace(/lim\s*art/gi, "DemoMart");

  // 6. Restore safe Demo URL
  output = output.replace(
    new RegExp(URL_PLACEHOLDER, "g"),
    "https://limart2.khanhdp.com/icons/capy_dashboard.webp"
  );

  return output;
}

/**
 * Rewrites a Payslip content snapshot so zero real names, emails, or real salary numbers remain.
 */
export function sanitizePayslipRecord(
  rawPayslip: {
    userId: string;
    month: number;
    year: number;
    content: any;
    netSalary: number;
    status?: string;
  },
  demoUser: {
    id: string;
    name: string;
    email: string;
    role: string;
    employmentType: "FULL_TIME" | "PART_TIME";
    hourlyRate: number;
    monthlySalary: number;
  },
  nameMap: Map<string, string>
): { content: Record<string, any>; netSalary: number } {
  const rawContent =
    rawPayslip.content && typeof rawPayslip.content === "object" ? rawPayslip.content : {};

  const isFullTime = demoUser.employmentType === "FULL_TIME";
  const standardDays = Number(rawContent.standardDays) || 26;
  const leaveCount = Math.max(0, Math.min(3, Number(rawContent.leaveCount) || 0));
  const dailySalary = isFullTime ? Math.round(demoUser.monthlySalary / standardDays) : 0;
  const dynamicHourlyRate = isFullTime
    ? Math.round(dailySalary / 8)
    : demoUser.hourlyRate || 25000;
  const effectiveHourlyRate = isFullTime ? dynamicHourlyRate : demoUser.hourlyRate || 25000;

  const rawDailyDetails = Array.isArray(rawContent.dailyDetails) ? rawContent.dailyDetails : [];
  let recomputedTotalHours = 0;
  let recomputedDaysWorked = 0;
  let recomputedDailySalarySum = 0;
  let recomputedSeniorBonus = 0;

  const sanitizedDailyDetails = rawDailyDetails.map((d: any) => {
    const hours = Number(d?.hours) || 0;
    const multiplier = Number(d?.multiplier) || 1;
    const isSenior = Boolean(d?.isSenior);
    const seniorBonus = isSenior ? Math.round(hours * 2000) : 0;
    const daySalary = Math.round(hours * effectiveHourlyRate * multiplier) + seniorBonus;

    if (hours > 0) {
      recomputedTotalHours += hours;
      recomputedDaysWorked += 1;
    }
    recomputedDailySalarySum += daySalary;
    recomputedSeniorBonus += seniorBonus;

    return {
      date: d?.date || "2026-10-01",
      checkIn: d?.checkIn || null,
      checkOut: d?.checkOut || null,
      hours: Math.round(hours * 100) / 100,
      salary: daySalary,
      isLate: Boolean(d?.isLate),
      multiplier,
      isValid: d?.isValid !== false,
      shift: sanitizeText(d?.shift || "Ca tiêu chuẩn", nameMap),
      isSenior,
      seniorBonus,
    };
  });

  const totalHours =
    recomputedTotalHours > 0
      ? Math.round(recomputedTotalHours * 100) / 100
      : Number(rawContent.totalHours) || (isFullTime ? 176 : 96);
  const daysWorked =
    recomputedDaysWorked > 0
      ? recomputedDaysWorked
      : Number(rawContent.daysWorked) || (isFullTime ? 24 : 16);

  const deduction = isFullTime ? Math.round(leaveCount * dailySalary) : 0;
  const baseSalary = isFullTime
    ? Math.max(0, Math.round(demoUser.monthlySalary - deduction))
    : recomputedDailySalarySum > 0
      ? recomputedDailySalarySum
      : Math.round(totalHours * effectiveHourlyRate);

  const rawAdjustments = Array.isArray(rawContent.adjustments) ? rawContent.adjustments : [];
  const sanitizedAdjustments = rawAdjustments.map((adj: any, idx: number) => {
    const isNegative = Number(adj?.amount) < 0;
    const amount = isNegative
      ? -50000
      : DEMO_ADJUSTMENT_AMOUNTS[idx % DEMO_ADJUSTMENT_AMOUNTS.length];
    return {
      id: adj?.id || `demo-adj-${idx + 1}`,
      userId: demoUser.id,
      amount,
      reason: isNegative ? "Phạt đi trễ ca sáng" : DEMO_ADJUSTMENT_REASONS[idx % DEMO_ADJUSTMENT_REASONS.length],
      date: adj?.date || new Date().toISOString(),
    };
  });

  const totalAdjustments = sanitizedAdjustments.reduce(
    (sum: number, a: { amount: number }) => sum + a.amount,
    0
  );

  const lateCount = Math.max(0, Math.min(5, Number(rawContent.lateCount) || 0));
  const latePenaltyHours = Number(rawContent.latePenaltyHours) || lateCount * 0.5;
  const latePenaltyAmount = Math.round(latePenaltyHours * effectiveHourlyRate);
  const bonusPercent = Number(rawContent.bonusPercent) || 0;
  const bonusAmount = Math.round(baseSalary * (bonusPercent / 100));

  const totalSalary = Math.max(
    0,
    Math.round(baseSalary + totalAdjustments - latePenaltyAmount)
  );
  const finalNet = Math.max(0, Math.round(totalSalary + bonusAmount));

  const content: Record<string, any> = {
    userId: demoUser.id,
    name: demoUser.name,
    userName: demoUser.name,
    email: demoUser.email,
    userEmail: demoUser.email,
    employmentType: demoUser.employmentType,
    hourlyRate: demoUser.hourlyRate,
    dynamicHourlyRate,
    monthlySalary: demoUser.monthlySalary,
    standardDays,
    dailySalary,
    leaveCount,
    deduction,
    totalHours,
    totalOvertimeHours: Math.max(0, Math.round((totalHours - 176) * 10) / 10),
    leaderboardOvertimeHours: Math.max(0, Math.round((totalHours - 176) * 10) / 10),
    daysWorked,
    checkinCount: daysWorked * 2,
    baseSalary,
    totalAdjustments,
    lateCount,
    latePenaltyHours,
    latePenaltyAmount,
    totalSeniorBonus: recomputedSeniorBonus,
    bonusPercent,
    bonusAmount,
    totalSalary,
    projectedSalary: finalNet,
    finalNet,
    isThuKpiSalary: false,
    adjustments: sanitizedAdjustments,
    dailyDetails: sanitizedDailyDetails,
  };

  return {
    content,
    netSalary: finalNet,
  };
}

export interface DemoPersona {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "PARTNER" | "USER";
  image: string;
  label: string;
  employmentType: string;
  hourlyRate: number;
  monthlySalary: number;
}

export async function getDemoPersonas(prismaClient: any = defaultPrisma): Promise<DemoPersona[]> {
  try {
    const users = await prismaClient.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        image: true,
        employmentType: true,
        hourlyRate: true,
        monthlySalary: true,
      },
      orderBy: { email: "asc" },
    });

    if (Array.isArray(users) && users.length > 0) {
      const admin =
        users.find((u: any) => u.email === "owner@demomart.vn") ||
        users.find((u: any) => u.role === "ADMIN");
      const partner =
        users.find((u: any) => u.email === "manager@demomart.vn") ||
        users.find((u: any) => u.role === "PARTNER");
      const staffList = users.filter((u: any) => u.role === "USER");

      const personas: DemoPersona[] = [];
      if (admin) {
        personas.push({
          id: admin.id,
          name: admin.name || "Nguyễn Minh Khôi (Chủ Shop Demo)",
          email: admin.email || "owner@demomart.vn",
          role: "ADMIN",
          image: admin.image || "/icons/capy_dashboard.webp",
          label: "Chủ Cửa Hàng (Admin)",
          employmentType: admin.employmentType || "FULL_TIME",
          hourlyRate: admin.hourlyRate || 0,
          monthlySalary: admin.monthlySalary || 15000000,
        });
      }
      if (partner) {
        personas.push({
          id: partner.id,
          name: partner.name || "Trần Bảo Ngọc (Quản Lý Ca)",
          email: partner.email || "manager@demomart.vn",
          role: "PARTNER",
          image: partner.image || "/icons/capy_manager.webp",
          label: "Quản Lý Ca (Partner)",
          employmentType: partner.employmentType || "FULL_TIME",
          hourlyRate: partner.hourlyRate || 0,
          monthlySalary: partner.monthlySalary || 10500000,
        });
      }
      for (const s of staffList.slice(0, 5)) {
        personas.push({
          id: s.id,
          name: s.name || "Lê Hoàng Nam",
          email: s.email || "nv01@demomart.vn",
          role: "USER",
          image: s.image || "/capybara_mascot.webp",
          label: "Nhân Viên (Staff)",
          employmentType: s.employmentType || "PART_TIME",
          hourlyRate: s.hourlyRate || 25000,
          monthlySalary: s.monthlySalary || 0,
        });
      }
      if (personas.length > 0) {
        return personas;
      }
    }
  } catch {
    // Fallback below
  }

  return [
    {
      id: "demo-owner",
      name: "Nguyễn Minh Khôi (Chủ Shop Demo)",
      email: "owner@demomart.vn",
      role: "ADMIN",
      image: "/icons/capy_dashboard.webp",
      label: "Chủ Cửa Hàng (Admin)",
      employmentType: "FULL_TIME",
      hourlyRate: 0,
      monthlySalary: 15000000,
    },
    {
      id: "demo-manager",
      name: "Trần Bảo Ngọc (Quản Lý Ca)",
      email: "manager@demomart.vn",
      role: "PARTNER",
      image: "/icons/capy_manager.webp",
      label: "Quản Lý Ca (Partner)",
      employmentType: "FULL_TIME",
      hourlyRate: 0,
      monthlySalary: 10500000,
    },
    {
      id: "demo-staff-01",
      name: "Lê Hoàng Nam",
      email: "nv01@demomart.vn",
      role: "USER",
      image: "/capybara_mascot.webp",
      label: "Nhân Viên (Staff)",
      employmentType: "PART_TIME",
      hourlyRate: 25000,
      monthlySalary: 0,
    },
  ];
}

export interface SeedDemoOptions {
  force?: boolean;
  prismaClient?: any;
  sourcePrismaClient?: any;
}

/**
 * Clones from SOURCE_DATABASE_URL (if configured) or seeds rich fallback data,
 * scrubbing all PII and randomizing staff names & salaries.
 */
export async function seedAndSanitizeDemoDatabase(options?: SeedDemoOptions): Promise<{
  skipped: boolean;
  usersSeeded: number;
  shiftsSeeded: number;
  checkinsSeeded: number;
  payslipsSeeded: number;
}> {
  // CRITICAL SAFETY LOCK 1
  if (!isDemoSandboxEnabled()) {
    throw new Error("DEMO_SANDBOX_MODE is not enabled");
  }

  // CRITICAL SAFETY LOCK 2
  const targetUrl = process.env.DATABASE_URL || "";
  if (process.env.NODE_ENV !== "test" && !targetUrl.includes("checkin_demo_db")) {
    throw new Error("SAFETY LOCK: Refusing to run demo sanitizer on non-demo database!");
  }

  const targetPrisma = options?.prismaClient || defaultPrisma;

  // Skip re-seeding on startup if already populated unless force === true
  if (!options?.force) {
    const existingCount = await targetPrisma.user.count();
    const existingOwner = await targetPrisma.user.findUnique({
      where: { email: "owner@demomart.vn" },
    });
    if (existingCount >= 3 && existingOwner) {
      return {
        skipped: true,
        usersSeeded: existingCount,
        shiftsSeeded: 0,
        checkinsSeeded: 0,
        payslipsSeeded: 0,
      };
    }
  }

  const sourceUrl = process.env.SOURCE_DATABASE_URL || "";
  const shouldConnectSource =
    !options?.sourcePrismaClient &&
    Boolean(sourceUrl) &&
    sourceUrl !== targetUrl;

  const createdSourcePrisma = shouldConnectSource
    ? new PrismaClient({ datasourceUrl: sourceUrl })
    : null;
  const sourcePrisma = options?.sourcePrismaClient || createdSourcePrisma;

  const now = new Date();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  let sourceData: {
    users: any[];
    holidays: any[];
    taskDefinitions: any[];
    taskItems: any[];
    userTasks: any[];
    prizes: any[];
    wheelHistory: any[];
    achievements: any[];
    shifts: any[];
    checkins: any[];
    shiftDuties: any[];
    managerTasks: any[];
    staffTasks: any[];
    checklistTasks: any[];
    checklistCompletions: any[];
    weeklyTasks: any[];
    announcements: any[];
    documents: any[];
    requests: any[];
    payrollPeriods: any[];
    payrollAdjustments: any[];
    payslips: any[];
  } = {
    users: [],
    holidays: [],
    taskDefinitions: [],
    taskItems: [],
    userTasks: [],
    prizes: [],
    wheelHistory: [],
    achievements: [],
    shifts: [],
    checkins: [],
    shiftDuties: [],
    managerTasks: [],
    staffTasks: [],
    checklistTasks: [],
    checklistCompletions: [],
    weeklyTasks: [],
    announcements: [],
    documents: [],
    requests: [],
    payrollPeriods: [],
    payrollAdjustments: [],
    payslips: [],
  };

  try {
    if (sourcePrisma) {
      try {
        const [
          users,
          holidays,
          taskDefinitions,
          taskItems,
          userTasks,
          prizes,
          wheelHistory,
          achievements,
          shifts,
          checkins,
          shiftDuties,
          managerTasks,
          staffTasks,
          checklistTasks,
          checklistCompletions,
          weeklyTasks,
          announcements,
          documents,
          requests,
          payrollPeriods,
          payrollAdjustments,
          payslips,
        ] = await Promise.all([
          sourcePrisma.user?.findMany ? sourcePrisma.user.findMany({ orderBy: { id: "asc" } }) : [],
          sourcePrisma.holiday?.findMany ? sourcePrisma.holiday.findMany() : [],
          sourcePrisma.taskDefinition?.findMany ? sourcePrisma.taskDefinition.findMany() : [],
          sourcePrisma.taskItem?.findMany ? sourcePrisma.taskItem.findMany() : [],
          sourcePrisma.userTask?.findMany ? sourcePrisma.userTask.findMany({ take: 200, orderBy: { createdAt: "desc" } }) : [],
          sourcePrisma.luckyWheelPrize?.findMany ? sourcePrisma.luckyWheelPrize.findMany() : [],
          sourcePrisma.luckyWheelHistory?.findMany ? sourcePrisma.luckyWheelHistory.findMany({ take: 100, orderBy: { createdAt: "desc" } }) : [],
          sourcePrisma.userAchievement?.findMany ? sourcePrisma.userAchievement.findMany() : [],
          sourcePrisma.workShift?.findMany
            ? sourcePrisma.workShift.findMany({
                where: { start: { gte: sixtyDaysAgo } },
                orderBy: { start: "asc" },
              })
            : [],
          sourcePrisma.checkIn?.findMany
            ? sourcePrisma.checkIn.findMany({
                where: { timestamp: { gte: sixtyDaysAgo } },
                orderBy: { timestamp: "asc" },
              })
            : [],
          sourcePrisma.shiftDuty?.findMany
            ? sourcePrisma.shiftDuty.findMany({
                where: { date: { gte: sixtyDaysAgo } },
              })
            : [],
          sourcePrisma.managerTask?.findMany ? sourcePrisma.managerTask.findMany() : [],
          sourcePrisma.staffTask?.findMany ? sourcePrisma.staffTask.findMany({ take: 150, orderBy: { createdAt: "desc" } }) : [],
          sourcePrisma.managerChecklistTask?.findMany ? sourcePrisma.managerChecklistTask.findMany() : [],
          sourcePrisma.managerChecklistCompletion?.findMany ? sourcePrisma.managerChecklistCompletion.findMany({ take: 200 }) : [],
          sourcePrisma.managerWeeklyTask?.findMany ? sourcePrisma.managerWeeklyTask.findMany({ take: 100 }) : [],
          sourcePrisma.announcement?.findMany ? sourcePrisma.announcement.findMany() : [],
          sourcePrisma.document?.findMany ? sourcePrisma.document.findMany() : [],
          sourcePrisma.request?.findMany ? sourcePrisma.request.findMany({ take: 100, orderBy: { createdAt: "desc" } }) : [],
          sourcePrisma.payrollPeriod?.findMany ? sourcePrisma.payrollPeriod.findMany() : [],
          sourcePrisma.payrollAdjustment?.findMany ? sourcePrisma.payrollAdjustment.findMany({ take: 150, orderBy: { date: "desc" } }) : [],
          sourcePrisma.payslip?.findMany ? sourcePrisma.payslip.findMany() : [],
        ]);

        sourceData = {
          users: users || [],
          holidays: holidays || [],
          taskDefinitions: taskDefinitions || [],
          taskItems: taskItems || [],
          userTasks: userTasks || [],
          prizes: prizes || [],
          wheelHistory: wheelHistory || [],
          achievements: achievements || [],
          shifts: shifts || [],
          checkins: checkins || [],
          shiftDuties: shiftDuties || [],
          managerTasks: managerTasks || [],
          staffTasks: staffTasks || [],
          checklistTasks: checklistTasks || [],
          checklistCompletions: checklistCompletions || [],
          weeklyTasks: weeklyTasks || [],
          announcements: announcements || [],
          documents: documents || [],
          requests: requests || [],
          payrollPeriods: payrollPeriods || [],
          payrollAdjustments: payrollAdjustments || [],
          payslips: payslips || [],
        };
      } catch (err) {
        console.warn("[Demo Sandbox] Source DB read failed, using fallback seed data:", err);
      }
    }
  } finally {
    if (createdSourcePrisma) {
      await createdSourcePrisma.$disconnect().catch(() => {});
    }
  }

  // Build anonymized users & nameMap
  const nameMap = new Map<string, string>();
  // Pre-seed known production names/handles into nameMap
  nameMap.set("Phúc Khánh", "Trần Bảo Ngọc");
  nameMap.set("Phuc Khanh", "Trần Bảo Ngọc");
  nameMap.set("phuckhanh22", "Trần Bảo Ngọc");
  nameMap.set("Mai Thị Na", "Nguyễn Minh Khôi");
  nameMap.set("maithina4040", "Nguyễn Minh Khôi");

  // Shuffle staff names slightly starting after index 0 if force reset so names feel fresh while keeping DEMO_STAFF_NAMES pool
  const staffPool = [...DEMO_STAFF_NAMES];
  if (options?.force && staffPool.length > 2) {
    for (let i = staffPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = staffPool[i];
      staffPool[i] = staffPool[j];
      staffPool[j] = tmp;
    }
  }

  interface SanitizedUser {
    id: string;
    name: string;
    email: string;
    image: string;
    role: "ADMIN" | "PARTNER" | "USER";
    isActive: boolean;
    luckyWheelAllowed: boolean;
    staffTasksAllowed: boolean;
    employmentType: "FULL_TIME" | "PART_TIME";
    hourlyRate: number;
    monthlySalary: number;
    birthday: Date | null;
    startDate: Date | null;
  }

  const sanitizedUsers: SanitizedUser[] = [];
  const sourceUsers = sourceData.users;

  if (sourceUsers.length > 0) {
    const firstAdmin = sourceUsers.find((u: any) => u.role === "ADMIN") || sourceUsers[0];
    const firstPartner = sourceUsers.find(
      (u: any) => u.role === "PARTNER" && u.id !== firstAdmin?.id
    );

    let staffIndex = 0;

    for (const u of sourceUsers) {
      if (firstAdmin && u.id === firstAdmin.id) {
        const demoName = "Nguyễn Minh Khôi (Chủ Shop Demo)";
        if (u.name) nameMap.set(u.name, demoName);
        sanitizedUsers.push({
          id: u.id,
          name: demoName,
          email: "owner@demomart.vn",
          image: "/icons/capy_dashboard.webp",
          role: "ADMIN",
          isActive: true,
          luckyWheelAllowed: true,
          staffTasksAllowed: true,
          employmentType: "FULL_TIME",
          hourlyRate: 0,
          monthlySalary: 15000000,
          birthday: u.birthday ? new Date(u.birthday) : new Date("1995-05-15T00:00:00.000Z"),
          startDate: u.startDate ? new Date(u.startDate) : new Date("2024-01-01T00:00:00.000Z"),
        });
      } else if (firstPartner && u.id === firstPartner.id) {
        const demoName = "Trần Bảo Ngọc (Quản Lý Ca)";
        if (u.name) nameMap.set(u.name, demoName);
        sanitizedUsers.push({
          id: u.id,
          name: demoName,
          email: "manager@demomart.vn",
          image: "/icons/capy_manager.webp",
          role: "PARTNER",
          isActive: true,
          luckyWheelAllowed: true,
          staffTasksAllowed: true,
          employmentType: "FULL_TIME",
          hourlyRate: 0,
          monthlySalary: 10500000,
          birthday: u.birthday ? new Date(u.birthday) : new Date("1998-08-20T00:00:00.000Z"),
          startDate: u.startDate ? new Date(u.startDate) : new Date("2024-03-01T00:00:00.000Z"),
        });
      } else {
        const assignedName = staffPool[staffIndex % staffPool.length];
        staffIndex += 1;
        const emailNum = String(staffIndex).padStart(2, "0");
        if (u.name) nameMap.set(u.name, assignedName);

        const empType: "FULL_TIME" | "PART_TIME" =
          u.employmentType === "FULL_TIME" ? "FULL_TIME" : "PART_TIME";
        const hourlyRate = empType === "PART_TIME" ? pickRandom(PART_TIME_RATES) : 0;
        const monthlySalary = empType === "FULL_TIME" ? pickRandom(FULL_TIME_SALARIES) : 0;

        sanitizedUsers.push({
          id: u.id,
          name: assignedName,
          email: `nv${emailNum}@demomart.vn`,
          image: "/capybara_mascot.webp",
          role: "USER",
          isActive: u.isActive !== false,
          luckyWheelAllowed: true,
          staffTasksAllowed: Boolean(u.staffTasksAllowed),
          employmentType: empType,
          hourlyRate,
          monthlySalary,
          birthday: u.birthday ? new Date(u.birthday) : new Date(2001, (staffIndex % 12), 10),
          startDate: u.startDate ? new Date(u.startDate) : new Date("2025-01-15T00:00:00.000Z"),
        });
      }
    }

    // Ensure a PARTNER exists if source had none
    if (!sanitizedUsers.some((u) => u.role === "PARTNER")) {
      sanitizedUsers.splice(1, 0, {
        id: "demo-partner-manager",
        name: "Trần Bảo Ngọc (Quản Lý Ca)",
        email: "manager@demomart.vn",
        image: "/icons/capy_manager.webp",
        role: "PARTNER",
        isActive: true,
        luckyWheelAllowed: true,
        staffTasksAllowed: true,
        employmentType: "FULL_TIME",
        hourlyRate: 0,
        monthlySalary: 10500000,
        birthday: new Date("1998-08-20T00:00:00.000Z"),
        startDate: new Date("2024-03-01T00:00:00.000Z"),
      });
    }
  } else {
    // Rich fallback users when no source DB is provided
    sanitizedUsers.push(
      {
        id: "demo-admin-owner",
        name: "Nguyễn Minh Khôi (Chủ Shop Demo)",
        email: "owner@demomart.vn",
        image: "/icons/capy_dashboard.webp",
        role: "ADMIN",
        isActive: true,
        luckyWheelAllowed: true,
        staffTasksAllowed: true,
        employmentType: "FULL_TIME",
        hourlyRate: 0,
        monthlySalary: 15000000,
        birthday: new Date("1995-05-15T00:00:00.000Z"),
        startDate: new Date("2024-01-01T00:00:00.000Z"),
      },
      {
        id: "demo-partner-manager",
        name: "Trần Bảo Ngọc (Quản Lý Ca)",
        email: "manager@demomart.vn",
        image: "/icons/capy_manager.webp",
        role: "PARTNER",
        isActive: true,
        luckyWheelAllowed: true,
        staffTasksAllowed: true,
        employmentType: "FULL_TIME",
        hourlyRate: 0,
        monthlySalary: 10500000,
        birthday: new Date("1998-08-20T00:00:00.000Z"),
        startDate: new Date("2024-03-01T00:00:00.000Z"),
      }
    );

    for (let i = 0; i < 6; i++) {
      const idx = i + 1;
      const emailNum = String(idx).padStart(2, "0");
      const isFT = i === 0;
      sanitizedUsers.push({
        id: `demo-staff-${emailNum}`,
        name: staffPool[i % staffPool.length],
        email: `nv${emailNum}@demomart.vn`,
        image: "/capybara_mascot.webp",
        role: "USER",
        isActive: true,
        luckyWheelAllowed: true,
        staffTasksAllowed: true,
        employmentType: isFT ? "FULL_TIME" : "PART_TIME",
        hourlyRate: isFT ? 0 : pickRandom(PART_TIME_RATES),
        monthlySalary: isFT ? pickRandom(FULL_TIME_SALARIES) : 0,
        birthday: new Date(2001, i, 12),
        startDate: new Date("2025-02-01T00:00:00.000Z"),
      });
    }
  }

  const userMapById = new Map<string, SanitizedUser>();
  for (const u of sanitizedUsers) {
    userMapById.set(u.id, u);
  }
  const adminUser = sanitizedUsers.find((u) => u.role === "ADMIN") || sanitizedUsers[0];
  const partnerUser =
    sanitizedUsers.find((u) => u.role === "PARTNER") || sanitizedUsers[1] || adminUser;
  const activeStaffUsers = sanitizedUsers.filter((u) => u.role === "USER" && u.isActive);
  const defaultStaffUser = activeStaffUsers[0] || partnerUser;

  async function safeExec<T>(fn: () => Promise<T> | T | undefined): Promise<T | undefined> {
    try {
      return await fn();
    } catch {
      return undefined;
    }
  }

  // Clear existing tables in safe reverse-FK order
  await safeExec(() => targetPrisma.sessionAuditLog?.deleteMany?.({}));
  await safeExec(() => targetPrisma.announcementRead?.deleteMany?.({}));
  await safeExec(() => targetPrisma.announcement?.deleteMany?.({}));
  await safeExec(() => targetPrisma.stickyNote?.deleteMany?.({}));
  await safeExec(() => targetPrisma.shiftDuty?.deleteMany?.({}));
  await safeExec(() => targetPrisma.shiftAuditLog?.deleteMany?.({}));
  await safeExec(() => targetPrisma.workShift?.deleteMany?.({}));
  await safeExec(() => targetPrisma.checkIn?.deleteMany?.({}));
  await safeExec(() => targetPrisma.request?.deleteMany?.({}));
  await safeExec(() => targetPrisma.payrollAdjustment?.deleteMany?.({}));
  await safeExec(() => targetPrisma.payslip?.deleteMany?.({}));
  await safeExec(() => targetPrisma.payrollPeriod?.deleteMany?.({}));
  await safeExec(() => targetPrisma.luckyWheelHistory?.deleteMany?.({}));
  await safeExec(() => targetPrisma.luckyWheelPrize?.deleteMany?.({}));
  await safeExec(() => targetPrisma.userAchievement?.deleteMany?.({}));
  await safeExec(() => targetPrisma.userTask?.deleteMany?.({}));
  await safeExec(() => targetPrisma.taskItem?.deleteMany?.({}));
  await safeExec(() => targetPrisma.taskDefinition?.deleteMany?.({}));
  await safeExec(() => targetPrisma.managerChecklistCompletion?.deleteMany?.({}));
  await safeExec(() => targetPrisma.managerChecklistTask?.deleteMany?.({}));
  await safeExec(() => targetPrisma.managerWeeklyTask?.deleteMany?.({}));
  await safeExec(() => targetPrisma.managerTask?.updateMany?.({ data: { parentId: null } }));
  await safeExec(() => targetPrisma.managerTask?.deleteMany?.({}));
  await safeExec(() => targetPrisma.staffTask?.deleteMany?.({}));
  await safeExec(() => targetPrisma.documentChunk?.deleteMany?.({}));
  await safeExec(() => targetPrisma.document?.deleteMany?.({}));
  await safeExec(() => targetPrisma.holiday?.deleteMany?.({}));
  await safeExec(() => targetPrisma.allowedIP?.deleteMany?.({}));
  await safeExec(() => targetPrisma.session?.deleteMany?.({}));
  await safeExec(() => targetPrisma.account?.deleteMany?.({}));
  await safeExec(() => targetPrisma.user?.deleteMany?.({}));

  // 1. Insert Users
  for (const u of sanitizedUsers) {
    await targetPrisma.user.create({
      data: {
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        role: u.role,
        isActive: u.isActive,
        luckyWheelAllowed: u.luckyWheelAllowed,
        staffTasksAllowed: u.staffTasksAllowed,
        employmentType: u.employmentType,
        hourlyRate: u.hourlyRate,
        monthlySalary: u.monthlySalary,
        birthday: u.birthday,
        startDate: u.startDate,
      },
    });
  }

  // 2. Insert AllowedIP (Public Demo Mode + Store WiFi)
  if (targetPrisma.allowedIP?.create) {
    await targetPrisma.allowedIP.create({
      data: {
        prefix: "0.0.0.0/0",
        label: "Demo Public Mode (Mọi mạng WiFi/4G)",
      },
    });
    await targetPrisma.allowedIP.create({
      data: {
        prefix: "103.199.",
        label: "WiFi Cửa Hàng DemoMart Tầng 1",
      },
    });
  }

  // 3. Insert Holidays
  const holidaysToSeed =
    sourceData.holidays.length > 0
      ? sourceData.holidays
      : [
          {
            id: "demo-hol-1",
            date: new Date("2026-09-02T00:00:00.000Z"),
            name: "Quốc Khánh 2/9 (Nhân hệ số x2.0)",
            multiplier: 2.0,
          },
          {
            id: "demo-hol-2",
            date: new Date("2026-10-20T00:00:00.000Z"),
            name: "Ngày Phụ Nữ Việt Nam 20/10 (x1.5)",
            multiplier: 1.5,
          },
        ];
  for (const h of holidaysToSeed) {
    await safeExec(() =>
      targetPrisma.holiday?.create?.({
        data: {
          id: h.id,
          date: new Date(h.date),
          name: sanitizeText(h.name, nameMap),
          multiplier: Number(h.multiplier) || 1.5,
        },
      })
    );
  }

  // 4. Insert TaskDefinitions, TaskItems, UserTasks
  const taskDefsToSeed =
    sourceData.taskDefinitions.length > 0
      ? sourceData.taskDefinitions
      : [
          {
            id: "demo-taskdef-pack-1",
            name: "Đóng gói đơn hàng Shopee/TikTok tiêu chuẩn",
            description: "Quấn chống sốc, dán mã vận đơn và xếp vào bao tải chuyển phát",
            baseReward: 1500,
            unit: "Đơn",
            active: true,
          },
          {
            id: "demo-taskdef-carry-1",
            name: "Bốc vác & xếp kiện hàng nhập kho tầng 2",
            description: "Kiểm đếm số lượng kiện hàng và xếp lên kệ kho theo phân khu",
            baseReward: 5000,
            unit: "Kiện",
            active: true,
          },
          {
            id: "demo-taskdef-wfh-1",
            name: "Hỗ trợ trực tin nhắn CSKH & chốt đơn ca tối (WFH)",
            description: "Phản hồi khách hàng trên Fanpage và sàn TMĐT trong vòng 5 phút",
            baseReward: 35000,
            unit: "Ca",
            active: true,
          },
        ];

  const taskDefRewardMap = new Map<string, number>();
  for (const td of taskDefsToSeed) {
    const reward = Number(td.baseReward) || 2000;
    taskDefRewardMap.set(td.id, reward);
    await safeExec(() =>
      targetPrisma.taskDefinition?.create?.({
        data: {
          id: td.id,
          name: sanitizeText(td.name, nameMap),
          description: sanitizeText(td.description || "", nameMap),
          baseReward: reward,
          unit: sanitizeText(td.unit || "Đơn", nameMap),
          active: td.active !== false,
        },
      })
    );
  }

  for (const ti of sourceData.taskItems) {
    if (!taskDefRewardMap.has(ti.taskDefId)) continue;
    const validAssignee = ti.assigneeId && userMapById.has(ti.assigneeId) ? ti.assigneeId : null;
    await safeExec(() =>
      targetPrisma.taskItem?.create?.({
        data: {
          id: ti.id,
          taskDefId: ti.taskDefId,
          title: sanitizeText(ti.title, nameMap),
          description: sanitizeText(ti.description || "", nameMap),
          deadline: ti.deadline ? new Date(ti.deadline) : null,
          status: ti.status || "OPEN",
          assigneeId: validAssignee,
        },
      })
    );
  }

  const userTasksToSeed =
    sourceData.userTasks.length > 0
      ? sourceData.userTasks
      : activeStaffUsers.slice(0, 4).map((u, idx) => ({
          id: `demo-ut-${idx + 1}`,
          userId: u.id,
          taskDefId: taskDefsToSeed[idx % taskDefsToSeed.length].id,
          quantity: (idx + 1) * 15,
          status: idx % 2 === 0 ? "APPROVED" : "SUBMITTED",
          note: "Đã hoàn thành đóng gói đầy đủ, có chụp ảnh đối chiếu tại bàn đóng hàng DemoMart",
          evidenceLink: "https://limart2.khanhdp.com/icons/capy_dashboard.webp",
          bonusPenalty: 0,
        }));

  for (const ut of userTasksToSeed) {
    if (!userMapById.has(ut.userId) || !taskDefRewardMap.has(ut.taskDefId)) continue;
    const unitPrice = taskDefRewardMap.get(ut.taskDefId) || 1500;
    const quantity = Math.max(1, Number(ut.quantity) || 1);
    const bonusPenalty = Number(ut.bonusPenalty) || 0;
    const finalAmount = Math.max(0, quantity * unitPrice + bonusPenalty);

    await safeExec(() =>
      targetPrisma.userTask?.create?.({
        data: {
          id: ut.id,
          userId: ut.userId,
          taskDefId: ut.taskDefId,
          unitPrice,
          quantity,
          status: ut.status || "APPROVED",
          evidenceLink: "https://limart2.khanhdp.com/icons/capy_dashboard.webp",
          note: sanitizeText(ut.note || "Hoàn thành định mức công việc tại DemoMart", nameMap),
          adminNote: ut.adminNote ? sanitizeText(ut.adminNote, nameMap) : null,
          bonusPenalty,
          finalAmount,
          startedAt: ut.startedAt ? new Date(ut.startedAt) : now,
          submittedAt: ut.submittedAt ? new Date(ut.submittedAt) : now,
          reviewedAt: ut.reviewedAt ? new Date(ut.reviewedAt) : now,
          reviewedBy: adminUser.id,
        },
      })
    );
  }

  // 5. LuckyWheelPrize, LuckyWheelHistory & UserAchievement
  const prizesToSeed =
    sourceData.prizes.length > 0
      ? sourceData.prizes
      : [
          {
            id: "demo-prize-1",
            name: "Thưởng nóng +50.000đ vào kỳ lương",
            description: "Cộng trực tiếp vào bảng lương tháng của nhân viên",
            image: "/icons/capy_reward.webp",
            quantity: 30,
            remaining: 25,
            probability: 20,
            type: "CASH",
            value: 50000,
          },
          {
            id: "demo-prize-2",
            name: "Voucher Trà Sữa Full Topping",
            description: "Đổi ngay 1 ly trà sữa tự chọn tại quầy pha chế",
            image: "/icons/capy_tea.webp",
            quantity: 40,
            remaining: 30,
            probability: 40,
            type: "VOUCHER",
            value: 35000,
          },
          {
            id: "demo-prize-3",
            name: "Gấu Bông Capybara Đội Quất",
            description: "Quà tặng lưu niệm độc quyền cho nhân viên chăm chỉ",
            image: "/capybara_mascot.webp",
            quantity: 20,
            remaining: 18,
            probability: 40,
            type: "PHYSICAL",
            value: 120000,
          },
        ];

  const validPrizeIds = new Set<string>();
  for (const p of prizesToSeed) {
    validPrizeIds.add(p.id);
    await safeExec(() =>
      targetPrisma.luckyWheelPrize?.create?.({
        data: {
          id: p.id,
          name: sanitizeText(p.name, nameMap),
          description: sanitizeText(p.description || "", nameMap),
          image: p.image || "/capybara_mascot.webp",
          quantity: Math.max(20, Number(p.quantity) || 20),
          remaining: Math.max(15, Number(p.remaining) || 15),
          probability: Number(p.probability) || 25,
          type: p.type || "PHYSICAL",
          active: true,
          value: Number(p.value) || 30000,
        },
      })
    );
  }

  for (const h of sourceData.wheelHistory) {
    if (!userMapById.has(h.userId)) continue;
    await safeExec(() =>
      targetPrisma.luckyWheelHistory?.create?.({
        data: {
          id: h.id,
          userId: h.userId,
          prizeId: h.prizeId && validPrizeIds.has(h.prizeId) ? h.prizeId : null,
          prizeName: sanitizeText(h.prizeName, nameMap),
          createdAt: h.createdAt ? new Date(h.createdAt) : now,
        },
      })
    );
  }

  for (const ach of sourceData.achievements) {
    if (!userMapById.has(ach.userId)) continue;
    await safeExec(() =>
      targetPrisma.userAchievement?.create?.({
        data: {
          id: ach.id,
          userId: ach.userId,
          code: ach.code,
          title: sanitizeText(ach.title || "", nameMap),
          description: sanitizeText(ach.description || "", nameMap),
          icon: ach.icon,
          unlockedAt: ach.unlockedAt ? new Date(ach.unlockedAt) : now,
        },
      })
    );
  }

  // 6. WorkShifts & CheckIns (recent 60 days + guarantee TODAY shifts & check-ins for >= 4 staff)
  let shiftsSeededCount = 0;
  let checkinsSeededCount = 0;
  const shiftIdMap = new Map<number, number>();

  for (const s of sourceData.shifts) {
    if (!userMapById.has(s.userId)) continue;
    try {
      const createdShift = await targetPrisma.workShift.create({
        data: {
          userId: s.userId,
          start: new Date(s.start),
          end: new Date(s.end),
          shiftType: sanitizeText(s.shiftType || "Ca Sáng", nameMap),
          status: s.status || "APPROVED",
          isOpenForSwap: Boolean(s.isOpenForSwap),
          isSenior: Boolean(s.isSenior),
        },
      });
      if (s.id && createdShift?.id) {
        shiftIdMap.set(s.id, createdShift.id);
      }
      shiftsSeededCount++;
    } catch {
      // Ignore shift duplicate
    }
  }

  // Ensure TODAY has shifts for at least 4 staff members in Vietnam timezone
  const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
  const vnYear = vnNow.getUTCFullYear();
  const vnMonth = vnNow.getUTCMonth();
  const vnDay = vnNow.getUTCDate();

  const todayMorningStart = new Date(Date.UTC(vnYear, vnMonth, vnDay, 8, 0, 0) - VN_OFFSET_MS);
  const todayMorningEnd = new Date(Date.UTC(vnYear, vnMonth, vnDay, 12, 0, 0) - VN_OFFSET_MS);
  const todayAfternoonStart = new Date(Date.UTC(vnYear, vnMonth, vnDay, 13, 0, 0) - VN_OFFSET_MS);
  const todayAfternoonEnd = new Date(Date.UTC(vnYear, vnMonth, vnDay, 17, 30, 0) - VN_OFFSET_MS);

  const todayStaffPool = [
    ...activeStaffUsers.slice(0, 4),
    partnerUser,
  ].slice(0, 4);

  for (let i = 0; i < todayStaffPool.length; i++) {
    const staffMember = todayStaffPool[i];
    if (!staffMember) continue;
    const isMorning = i % 2 === 0;
    try {
      await targetPrisma.workShift.create({
        data: {
          userId: staffMember.id,
          start: isMorning ? todayMorningStart : todayAfternoonStart,
          end: isMorning ? todayMorningEnd : todayAfternoonEnd,
          shiftType: isMorning ? "Ca Sáng (08:00 - 12:00)" : "Ca Chiều (13:00 - 17:30)",
          status: "APPROVED",
          isOpenForSwap: i === 3,
          isSenior: i === 0,
        },
      });
      shiftsSeededCount++;
    } catch {
      // Ignore
    }
  }

  // Copy source CheckIns with scrubbed IP and notes
  for (const ck of sourceData.checkins) {
    if (!userMapById.has(ck.userId)) continue;
    try {
      await targetPrisma.checkIn.create({
        data: {
          userId: ck.userId,
          type: ck.type || "checkin",
          timestamp: new Date(ck.timestamp),
          ipAddress: "103.199.18.88",
          note: ck.note ? sanitizeText(ck.note, nameMap) : null,
        },
      });
      checkinsSeededCount++;
    } catch {
      // Ignore
    }
  }

  // Ensure TODAY has live check-ins so Admin Dashboard is lively immediately
  for (let i = 0; i < Math.min(3, todayStaffPool.length); i++) {
    const staffMember = todayStaffPool[i];
    if (!staffMember) continue;
    const checkinTime = new Date(todayMorningStart.getTime() - (5 - i * 2) * 60 * 1000);
    try {
      await targetPrisma.checkIn.create({
        data: {
          userId: staffMember.id,
          type: "checkin",
          timestamp: checkinTime,
          ipAddress: "103.199.18.88",
          note: "Check-in ca sáng tại cửa hàng DemoMart",
        },
      });
      checkinsSeededCount++;
    } catch {
      // Ignore
    }
  }

  // 7. ShiftDuties, ManagerTasks, StaffTasks, Checklists, WeeklyTasks
  for (const sd of sourceData.shiftDuties) {
    if (!userMapById.has(sd.userId)) continue;
    const creatorId = userMapById.has(sd.createdById) ? sd.createdById : adminUser.id;
    const mappedShiftId = sd.shiftId && shiftIdMap.has(sd.shiftId) ? shiftIdMap.get(sd.shiftId) : null;
    await safeExec(() =>
      targetPrisma.shiftDuty?.create?.({
        data: {
          id: sd.id,
          shiftId: mappedShiftId ?? null,
          userId: sd.userId,
          createdById: creatorId,
          date: new Date(sd.date),
          title: sanitizeText(sd.title, nameMap),
          description: sd.description ? sanitizeText(sd.description, nameMap) : null,
          isCompleted: Boolean(sd.isCompleted),
          completedAt: sd.completedAt ? new Date(sd.completedAt) : null,
        },
      })
    );
  }

  const managerTasksToSeed =
    sourceData.managerTasks.length > 0
      ? sourceData.managerTasks
      : [
          {
            id: "demo-mt-1",
            title: "Kiểm kê tồn kho kệ hàng khuyến mãi cuối tuần",
            description: "Đối chiếu số lượng thực tế với phần mềm POS tại DemoMart",
            isUrgent: true,
            isImportant: true,
            status: "DOING",
            assigneeId: partnerUser.id,
            createdById: adminUser.id,
          },
          {
            id: "demo-mt-2",
            title: "Duyệt lịch đăng ký ca làm việc tuần tới",
            description: "Đảm bảo mỗi ca có tối thiểu 2 nhân viên part-time và 1 ca trưởng",
            isUrgent: false,
            isImportant: true,
            status: "TODO",
            assigneeId: partnerUser.id,
            createdById: adminUser.id,
          },
        ];

  for (const mt of managerTasksToSeed) {
    const creatorId = userMapById.has(mt.createdById) ? mt.createdById : adminUser.id;
    const assigneeId = mt.assigneeId && userMapById.has(mt.assigneeId) ? mt.assigneeId : partnerUser.id;
    await safeExec(() =>
      targetPrisma.managerTask?.create?.({
        data: {
          id: mt.id,
          title: sanitizeText(mt.title, nameMap),
          description: mt.description ? sanitizeText(mt.description, nameMap) : null,
          isUrgent: Boolean(mt.isUrgent),
          isImportant: Boolean(mt.isImportant),
          status: mt.status || "TODO",
          assigneeId,
          parentId: null,
          startDate: mt.startDate ? new Date(mt.startDate) : now,
          deadline: mt.deadline ? new Date(mt.deadline) : new Date(now.getTime() + 86400000),
          createdById: creatorId,
        },
      })
    );
  }

  const staffTasksToSeed =
    sourceData.staffTasks.length > 0
      ? sourceData.staffTasks
      : [
          {
            id: "demo-st-1",
            title: "Sắp xếp lại quầy trưng bày sản phẩm mới",
            description: "Lau kệ, dán tem giá mới và chụp ảnh báo cáo hoàn thành",
            status: "APPROVED",
            assigneeId: defaultStaffUser.id,
            createdById: partnerUser.id,
            evidenceLink: "https://limart2.khanhdp.com/icons/capy_dashboard.webp",
            evidenceNote: "Đã hoàn thành trưng bày tại quầy trung tâm DemoMart",
          },
        ];

  for (const st of staffTasksToSeed) {
    const assigneeId = userMapById.has(st.assigneeId) ? st.assigneeId : defaultStaffUser.id;
    const creatorId = userMapById.has(st.createdById) ? st.createdById : partnerUser.id;
    await safeExec(() =>
      targetPrisma.staffTask?.create?.({
        data: {
          id: st.id,
          title: sanitizeText(st.title, nameMap),
          description: st.description ? sanitizeText(st.description, nameMap) : null,
          status: st.status || "TODO",
          assigneeId,
          createdById: creatorId,
          startDate: st.startDate ? new Date(st.startDate) : now,
          deadline: st.deadline ? new Date(st.deadline) : new Date(now.getTime() + 86400000),
          submittedAt: st.submittedAt ? new Date(st.submittedAt) : null,
          completedAt: st.completedAt ? new Date(st.completedAt) : null,
          adminNote: st.adminNote ? sanitizeText(st.adminNote, nameMap) : null,
          evidenceLink: st.evidenceLink
            ? "https://limart2.khanhdp.com/icons/capy_dashboard.webp"
            : null,
          evidenceNote: st.evidenceNote ? sanitizeText(st.evidenceNote, nameMap) : null,
        },
      })
    );
  }

  const validChecklistIds = new Set<string>();
  for (const ct of sourceData.checklistTasks) {
    const assigneeId = userMapById.has(ct.assigneeId) ? ct.assigneeId : partnerUser.id;
    validChecklistIds.add(ct.id);
    await safeExec(() =>
      targetPrisma.managerChecklistTask?.create?.({
        data: {
          id: ct.id,
          title: sanitizeText(ct.title, nameMap),
          description: ct.description ? sanitizeText(ct.description, nameMap) : null,
          assigneeId,
          active: ct.active !== false,
          targetDate: ct.targetDate || null,
          order: Number(ct.order) || 0,
        },
      })
    );
  }

  for (const cc of sourceData.checklistCompletions) {
    if (!validChecklistIds.has(cc.taskId)) continue;
    await safeExec(() =>
      targetPrisma.managerChecklistCompletion?.create?.({
        data: {
          id: cc.id,
          taskId: cc.taskId,
          date: cc.date,
          completed: Boolean(cc.completed),
          completedAt: cc.completedAt ? new Date(cc.completedAt) : null,
        },
      })
    );
  }

  for (const wt of sourceData.weeklyTasks) {
    const assigneeId = userMapById.has(wt.assigneeId) ? wt.assigneeId : partnerUser.id;
    await safeExec(() =>
      targetPrisma.managerWeeklyTask?.create?.({
        data: {
          id: wt.id,
          title: sanitizeText(wt.title, nameMap),
          description: wt.description ? sanitizeText(wt.description, nameMap) : null,
          assigneeId,
          weekStart: new Date(wt.weekStart),
          weekEnd: new Date(wt.weekEnd),
          completed: Boolean(wt.completed),
          completedAt: wt.completedAt ? new Date(wt.completedAt) : null,
          explanation: wt.explanation ? sanitizeText(wt.explanation, nameMap) : null,
          isCarriedOver: Boolean(wt.isCarriedOver),
        },
      })
    );
  }

  // 8. Announcements (welcome demo announcement + sanitized announcements)
  await safeExec(() =>
    targetPrisma.announcement?.create?.({
      data: {
        id: "demo-welcome-announcement",
        title: "🎉 Chào mừng đến với DemoMart — Không gian Trải nghiệm Sản phẩm!",
        content:
          "Bạn đang ở chế độ Demo Sandbox độc lập. Mọi tên nhân viên và mức lương đều là dữ liệu mẫu ngẫu nhiên. Bạn có thể thoải mái bấm Chấm công, Quay thưởng, Giao việc, Tính lương hoặc Chuyển đổi vai trò (Chủ Shop / Quản lý / Nhân viên) ở thanh công cụ phía trên!",
        type: "INFO",
        active: true,
      },
    })
  );

  for (const ann of sourceData.announcements) {
    if (ann.id === "demo-welcome-announcement") continue;
    await safeExec(() =>
      targetPrisma.announcement?.create?.({
        data: {
          id: ann.id,
          title: sanitizeText(ann.title, nameMap),
          content: sanitizeText(ann.content, nameMap),
          type: ann.type || "INFO",
          active: ann.active !== false,
        },
      })
    );
  }

  // 9. Documents (SOP Knowledge Base)
  const docsToSeed =
    sourceData.documents.length > 0
      ? sourceData.documents
      : [
          {
            id: "demo-doc-sop-1",
            path: "noi-quy-cham-cong-demomart.md",
            title: "Nội quy Chấm công & Ca làm việc tại DemoMart",
            content:
              "Nhân viên thực hiện Check-in trên ứng dụng khi kết nối WiFi cửa hàng DemoMart hoặc bật định vị GPS trong bán kính 150m. Đi trễ quá 5 phút sẽ ghi nhận nhắc nhở tự động.",
          },
          {
            id: "demo-doc-sop-2",
            path: "quy-trinh-dong-goi-khoan.md",
            title: "Quy trình Đóng gói Đơn hàng & Tính thưởng Khoán",
            content:
              "Mỗi đơn hàng đóng gói đạt chuẩn có quay video/chụp ảnh đối chiếu tại bàn đóng gói DemoMart được cộng tự động vào bảng lương khoán cuối tháng.",
          },
        ];

  for (const doc of docsToSeed) {
    await safeExec(() =>
      targetPrisma.document?.create?.({
        data: {
          id: doc.id,
          path: doc.path,
          title: sanitizeText(doc.title, nameMap),
          content: sanitizeText(doc.content, nameMap),
        },
      })
    );
  }

  // 10. Requests (generic reasons)
  const requestsToSeed =
    sourceData.requests.length > 0
      ? sourceData.requests
      : activeStaffUsers.slice(0, 3).map((u, idx) => ({
          id: idx + 1,
          userId: u.id,
          type: idx % 2 === 0 ? "LEAVE" : "SHIFT_CHANGE",
          date: now,
          status: idx === 0 ? "PENDING" : "APPROVED",
        }));

  for (let i = 0; i < requestsToSeed.length; i++) {
    const reqItem = requestsToSeed[i];
    if (!userMapById.has(reqItem.userId)) continue;
    await safeExec(() =>
      targetPrisma.request?.create?.({
        data: {
          userId: reqItem.userId,
          type: reqItem.type || "LEAVE",
          date: reqItem.date ? new Date(reqItem.date) : now,
          reason: DEMO_REQUEST_REASONS[i % DEMO_REQUEST_REASONS.length],
          status: reqItem.status || "PENDING",
        },
      })
    );
  }

  // 11. PayrollPeriod, PayrollAdjustment & Sanitized Payslips
  for (const pp of sourceData.payrollPeriods) {
    await safeExec(() =>
      targetPrisma.payrollPeriod?.create?.({
        data: {
          id: pp.id,
          month: pp.month,
          year: pp.year,
          status: pp.status || "OPEN",
          bonusPercent: Number(pp.bonusPercent) || 0,
          bonusTargets: pp.bonusTargets || ["PART_TIME"],
          excludedBonusUsers: [],
        },
      })
    );
  }

  const adjustmentsToSeed =
    sourceData.payrollAdjustments.length > 0
      ? sourceData.payrollAdjustments
      : activeStaffUsers.slice(0, 4).map((u, idx) => ({
          id: `demo-padj-${idx + 1}`,
          userId: u.id,
          date: now,
        }));

  for (let i = 0; i < adjustmentsToSeed.length; i++) {
    const adj = adjustmentsToSeed[i];
    if (!userMapById.has(adj.userId)) continue;
    await safeExec(() =>
      targetPrisma.payrollAdjustment?.create?.({
        data: {
          id: adj.id,
          userId: adj.userId,
          amount: DEMO_ADJUSTMENT_AMOUNTS[i % DEMO_ADJUSTMENT_AMOUNTS.length],
          reason: DEMO_ADJUSTMENT_REASONS[i % DEMO_ADJUSTMENT_REASONS.length],
          date: adj.date ? new Date(adj.date) : now,
        },
      })
    );
  }

  let payslipsSeededCount = 0;
  const payslipsToSeed =
    sourceData.payslips.length > 0
      ? sourceData.payslips
      : sanitizedUsers.slice(0, 5).map((u, idx) => ({
          id: `demo-payslip-${idx + 1}`,
          userId: u.id,
          month: vnNow.getUTCMonth() + 1,
          year: vnNow.getUTCFullYear(),
          status: "PENDING",
          netSalary: 0,
          content: {
            totalHours: u.employmentType === "FULL_TIME" ? 176 : 96,
            daysWorked: u.employmentType === "FULL_TIME" ? 24 : 16,
            standardDays: 26,
            leaveCount: 0,
            lateCount: 0,
            bonusPercent: 5,
            adjustments: [
              {
                id: `demo-ps-adj-${idx + 1}`,
                amount: 150000,
                reason: "Thưởng chuyên cần",
                date: now.toISOString(),
              },
            ],
            dailyDetails: [
              {
                date: `${vnYear}-${String(vnMonth + 1).padStart(2, "0")}-01`,
                hours: 8,
                multiplier: 1,
                isLate: false,
                isValid: true,
                shift: "Ca Sáng (08:00 - 16:00)",
              },
            ],
          },
        }));

  for (const ps of payslipsToSeed) {
    const demoUser = userMapById.get(ps.userId);
    if (!demoUser) continue;

    const { content, netSalary } = sanitizePayslipRecord(ps, demoUser, nameMap);

    try {
      await targetPrisma.payslip.create({
        data: {
          id: ps.id,
          userId: demoUser.id,
          month: ps.month,
          year: ps.year,
          content,
          netSalary,
          status: ps.status || "PENDING",
          emailSentAt: null,
        },
      });
      payslipsSeededCount++;
    } catch {
      // Ignore duplicate month/year payslip
    }
  }

  // Clear Redis caches after demo seed
  await safeExec(() => invalidateCachePattern("*"));

  return {
    skipped: false,
    usersSeeded: sanitizedUsers.length,
    shiftsSeeded: shiftsSeededCount,
    checkinsSeeded: checkinsSeededCount,
    payslipsSeeded: payslipsSeededCount,
  };
}
