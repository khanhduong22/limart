import React from "react";
import { Clock, Calendar, Briefcase, Wallet, User } from "lucide-react";

export type NavTab = "home" | "tasks" | "schedule" | "payroll" | "profile" | "staff-tasks";

interface BottomNavigationProps {
  currentTab: NavTab;
  onChangeTab: (tab: NavTab) => void;
  userRole?: string;
  isWide?: boolean;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  currentTab,
  onChangeTab,
  userRole,
  isWide,
}) => {
  const isPartner = userRole === "PARTNER";

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = isPartner
    ? [
        { id: "tasks", label: "Công việc", icon: Briefcase },
        { id: "payroll", label: "Bảng lương", icon: Wallet },
        { id: "profile", label: "Cá nhân", icon: User },
      ]
    : [
        { id: "home", label: "Chấm công", icon: Clock },
        { id: "tasks", label: "Công việc", icon: Briefcase },
        { id: "schedule", label: "Lịch trực", icon: Calendar },
        { id: "payroll", label: "Bảng lương", icon: Wallet },
        { id: "profile", label: "Cá nhân", icon: User },
      ];

  const gridColsClass = isPartner ? "grid-cols-3" : "grid-cols-5";

  return (
    <nav
      role="navigation"
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none select-none pb-safe"
    >
      <div
        className={`w-full mx-auto pointer-events-auto bg-[#faf6f0]/95 backdrop-blur-md border-t border-orange-100/90 shadow-lg transition-all duration-200 ${
          isWide || isPartner
            ? "max-w-4xl lg:max-w-5xl xl:max-w-6xl max-w-full md:border-x md:rounded-t-2xl px-2 md:px-4"
            : "max-w-md max-w-full"
        }`}
      >
        <div className={`grid ${gridColsClass} h-14 md:h-16 items-center px-1`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onChangeTab(item.id)}
                className={`relative flex flex-col items-center justify-center h-full py-1 px-1 transition-all duration-150 active:scale-95 cursor-pointer min-w-0 ${
                  isActive
                    ? "text-amber-800 font-bold"
                    : "text-stone-500 hover:text-stone-700 font-medium"
                }`}
              >
                {/* Active Pill Indicator */}
                {isActive && (
                  <div className="absolute top-0 w-6 sm:w-8 md:w-12 h-1 bg-amber-500 rounded-b-full shadow-xs" />
                )}

                <div className="relative mt-0.5">
                  <Icon
                    className={`w-4.5 h-4.5 md:w-5 md:h-5 transition-transform duration-150 shrink-0 ${
                      isActive ? "scale-105 text-amber-700" : "text-stone-400"
                    }`}
                  />
                </div>

                <span className="text-[9.5px] sm:text-[10px] md:text-xs tracking-tight mt-0.5 whitespace-nowrap truncate max-w-full">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNavigation;
