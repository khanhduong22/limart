import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageLoadingSkeleton } from "@/components/ui/AdminPageLoadingSkeleton";
import { useAppVersionGuard, VersionGuardBanner } from "@checkin/spa-version-guard";
import { DeferredTelemetryProvider } from "@checkin/deferred-telemetry";

export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkKey: string
) {
  return React.lazy(async () => {
    const storageKey = `limart_chunk_retry_${chunkKey}`;
    try {
      const component = await factory();
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore storage errors
      }
      return component;
    } catch (error) {
      let hasRetried = false;
      try {
        hasRetried = window.sessionStorage.getItem(storageKey) === "1";
      } catch {
        // Ignore storage errors
      }
      if (!hasRetried && typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(storageKey, "1");
        } catch {
          // Ignore storage errors
        }
        window.location.reload();
        return { default: (() => null) as unknown as T };
      }
      throw error;
    }
  });
}

// Dynamic Code-Splitting: Route-level lazy loading with auto-recovery on stale chunk hashes
const DashboardPage = lazyWithRetry(
  () => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
  "DashboardPage"
);
const EmployeesPage = lazyWithRetry(
  () => import("@/pages/EmployeesPage").then((m) => ({ default: m.EmployeesPage })),
  "EmployeesPage"
);
const EmployeeDetailPage = lazyWithRetry(
  () =>
    import("@/pages/EmployeeDetailPage").then((m) => ({
      default: m.EmployeeDetailPage,
    })),
  "EmployeeDetailPage"
);
const EmployeePayrollPage = lazyWithRetry(
  () =>
    import("@/pages/EmployeePayrollPage").then((m) => ({
      default: m.EmployeePayrollPage,
    })),
  "EmployeePayrollPage"
);
const PayrollPage = lazyWithRetry(
  () => import("@/pages/PayrollPage").then((m) => ({ default: m.PayrollPage })),
  "PayrollPage"
);
const SchedulePage = lazyWithRetry(
  () => import("@/pages/SchedulePage").then((m) => ({ default: m.SchedulePage })),
  "SchedulePage"
);
const RequestsPage = lazyWithRetry(
  () => import("@/pages/RequestsPage").then((m) => ({ default: m.RequestsPage })),
  "RequestsPage"
);
const LuckyWheelPage = lazyWithRetry(
  () => import("@/pages/LuckyWheelPage").then((m) => ({ default: m.LuckyWheelPage })),
  "LuckyWheelPage"
);
const AnnouncementsPage = lazyWithRetry(
  () =>
    import("@/pages/AnnouncementsPage").then((m) => ({
      default: m.AnnouncementsPage,
    })),
  "AnnouncementsPage"
);
const SettingsPage = lazyWithRetry(
  () => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
  "SettingsPage"
);
const ReportsPage = lazyWithRetry(
  () => import("@/pages/ReportsPage").then((m) => ({ default: m.ReportsPage })),
  "ReportsPage"
);
const TasksPage = lazyWithRetry(
  () => import("@/pages/TasksPage").then((m) => ({ default: m.TasksPage })),
  "TasksPage"
);
const AuditLogPage = lazyWithRetry(
  () => import("@/pages/AuditLogPage").then((m) => ({ default: m.AuditLogPage })),
  "AuditLogPage"
);
const ManagerTasksPage = lazyWithRetry(
  () =>
    import("@/pages/ManagerTasksPage").then((m) => ({
      default: m.ManagerTasksPage,
    })),
  "ManagerTasksPage"
);
const StaffTasksPage = lazyWithRetry(
  () =>
    import("@/pages/StaffTasksPage").then((m) => ({
      default: m.StaffTasksPage,
    })),
  "StaffTasksPage"
);
const HelpPage = lazyWithRetry(
  () => import("@/pages/HelpPage").then((m) => ({ default: m.HelpPage })),
  "HelpPage"
);
const ChangelogPage = lazyWithRetry(
  () => import("@/pages/ChangelogPage").then((m) => ({ default: m.ChangelogPage })),
  "ChangelogPage"
);

export default function App() {
  const { isUpdating } = useAppVersionGuard();

  return (
    <DeferredTelemetryProvider config={{ googleAnalyticsId: "G-LIMART-ADMIN", debug: false }}>
      <QueryClientProvider client={queryClient}>
        <VersionGuardBanner isUpdating={isUpdating} />
        <BrowserRouter basename="/admin">
          <Suspense fallback={<AdminPageLoadingSkeleton />}>
            <Routes>
              <Route path="/" element={<AdminLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="employees" element={<EmployeesPage />} />
                <Route path="employees/:id" element={<EmployeeDetailPage />} />
                <Route path="schedule" element={<SchedulePage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="requests" element={<RequestsPage />} />
                <Route path="announcements" element={<AnnouncementsPage />} />
                <Route path="payroll" element={<PayrollPage />} />
                <Route path="payroll/:userId" element={<EmployeePayrollPage />} />
                <Route path="changelog" element={<ChangelogPage />} />
                <Route path="lucky-wheel" element={<LuckyWheelPage />} />
                <Route path="tasks" element={<TasksPage />} />
                <Route path="manager-tasks" element={<ManagerTasksPage />} />
                <Route path="staff-tasks" element={<StaffTasksPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="audit-logs" element={<AuditLogPage />} />
                <Route
                  path="audit"
                  element={<Navigate to="/audit-logs" replace />}
                />
                <Route path="help" element={<HelpPage />} />
                {/* Catch-all route redirects to dashboard */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </DeferredTelemetryProvider>
  );
}
