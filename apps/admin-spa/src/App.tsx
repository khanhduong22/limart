import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageLoadingSkeleton } from "@/components/ui/AdminPageLoadingSkeleton";
import { useAppVersionGuard, VersionGuardBanner } from "@checkin/spa-version-guard";
import { DeferredTelemetryProvider } from "@checkin/deferred-telemetry";

// Dynamic Code-Splitting: Route-level lazy loading
const DashboardPage = React.lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage }))
);
const EmployeesPage = React.lazy(() =>
  import("@/pages/EmployeesPage").then((m) => ({ default: m.EmployeesPage }))
);
const EmployeeDetailPage = React.lazy(() =>
  import("@/pages/EmployeeDetailPage").then((m) => ({
    default: m.EmployeeDetailPage,
  }))
);
const EmployeePayrollPage = React.lazy(() =>
  import("@/pages/EmployeePayrollPage").then((m) => ({
    default: m.EmployeePayrollPage,
  }))
);
const PayrollPage = React.lazy(() =>
  import("@/pages/PayrollPage").then((m) => ({ default: m.PayrollPage }))
);
const SchedulePage = React.lazy(() =>
  import("@/pages/SchedulePage").then((m) => ({ default: m.SchedulePage }))
);
const RequestsPage = React.lazy(() =>
  import("@/pages/RequestsPage").then((m) => ({ default: m.RequestsPage }))
);
const LuckyWheelPage = React.lazy(() =>
  import("@/pages/LuckyWheelPage").then((m) => ({ default: m.LuckyWheelPage }))
);
const AnnouncementsPage = React.lazy(() =>
  import("@/pages/AnnouncementsPage").then((m) => ({
    default: m.AnnouncementsPage,
  }))
);
const SettingsPage = React.lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const ReportsPage = React.lazy(() =>
  import("@/pages/ReportsPage").then((m) => ({ default: m.ReportsPage }))
);
const TasksPage = React.lazy(() =>
  import("@/pages/TasksPage").then((m) => ({ default: m.TasksPage }))
);
const AuditLogPage = React.lazy(() =>
  import("@/pages/AuditLogPage").then((m) => ({ default: m.AuditLogPage }))
);
const ManagerTasksPage = React.lazy(() =>
  import("@/pages/ManagerTasksPage").then((m) => ({
    default: m.ManagerTasksPage,
  }))
);
const StaffTasksPage = React.lazy(() =>
  import("@/pages/StaffTasksPage").then((m) => ({
    default: m.StaffTasksPage,
  }))
);
const HelpPage = React.lazy(() =>
  import("@/pages/HelpPage").then((m) => ({ default: m.HelpPage }))
);
const ChangelogPage = React.lazy(() =>
  import("@/pages/ChangelogPage").then((m) => ({ default: m.ChangelogPage }))
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
