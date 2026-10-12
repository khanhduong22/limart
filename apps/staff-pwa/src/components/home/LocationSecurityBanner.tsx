import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Wifi, ShieldCheck, AlertTriangle } from "lucide-react";

export interface LocationSecurityBannerProps {
  ipStatus: {
    isAllowed: boolean;
    locationName: string;
    ip: string;
  } | null;
  className?: string;
}

export const LocationSecurityBanner: React.FC<LocationSecurityBannerProps> = ({
  ipStatus,
  className,
}) => {
  if (!ipStatus) {
    return (
      <div className={cn("flex flex-col items-center gap-1.5 py-1", className)}>
        <div className="h-6 w-36 bg-gray-200/80 animate-pulse rounded-full" />
      </div>
    );
  }

  const { isAllowed, locationName, ip } = ipStatus;

  return (
    <div className={cn("flex flex-col items-center gap-1.5 w-full", className)}>
      <Badge
        variant={isAllowed ? "default" : "destructive"}
        className={cn(
          "px-3 py-1 flex items-center gap-1.5 text-xs font-semibold shadow-2xs transition-all",
          isAllowed
            ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
            : "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100"
        )}
      >
        {isAllowed ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>{locationName}</span>
          </>
        ) : (
          <>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>Ngoài cửa hàng: {locationName}</span>
          </>
        )}
      </Badge>

      {!isAllowed && (
        <div className="w-full bg-rose-50/90 border border-rose-200 rounded-xl p-2.5 text-center space-y-1 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-rose-800">
            <Wifi className="w-3.5 h-3.5" />
            <span>Chưa kết nối Wi-Fi cửa hàng LimArt</span>
          </div>
          <p className="text-[10px] text-rose-600">
            Vui lòng kết nối mạng nội bộ của cửa hàng để thực hiện chấm công hợp lệ.
          </p>
          <div className="text-[10px] font-mono text-rose-700 bg-white/80 px-2 py-0.5 rounded border border-rose-100 inline-block max-w-full break-all">
            IP hiện tại: {ip}
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationSecurityBanner;
