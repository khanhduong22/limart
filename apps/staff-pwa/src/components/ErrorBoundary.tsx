import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./ui/button";
import { RotateCw, Home, AlertTriangle, RefreshCw } from "lucide-react";
import { clearPwaCacheAndReload } from "../lib/pwa-register";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Staff PWA ErrorBoundary Caught]", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="w-full max-w-sm bg-white/95 backdrop-blur-md rounded-3xl p-6 border border-amber-200/80 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            {/* Mascot Capybara */}
            <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
              <img
                src="/capybara_mascot.webp"
                alt="Capybara Mascot"
                className="w-20 h-20 object-contain drop-shadow-md animate-bounce"
                onError={(e) => {
                  // Fallback emoji if image fails to load
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
              <span className="text-4xl absolute -bottom-1 -right-1">🍊</span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-base font-extrabold text-stone-900 tracking-tight flex items-center justify-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Đã xảy ra sự cố hiển thị</span>
              </h2>
              <p className="text-xs text-stone-600 leading-relaxed">
                Capybara đã kịp thời ngăn ngừa sự cố trắng màn hình. Bạn hãy thử tải lại trang nhé!
              </p>
            </div>

            {this.state.error?.message && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-2.5 text-left">
                <p className="text-[10px] font-mono text-amber-900 break-words line-clamp-3">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={this.handleGoHome}
                  className="flex-1 h-9 text-xs font-bold border-stone-200 text-stone-700 hover:bg-stone-50 rounded-xl cursor-pointer flex items-center justify-center gap-1"
                >
                  <Home className="w-3.5 h-3.5" /> Trang chủ
                </Button>
                <Button
                  type="button"
                  onClick={this.handleReload}
                  className="flex-1 h-9 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Tải lại
                </Button>
              </div>

              <Button
                type="button"
                variant="ghost"
                onClick={clearPwaCacheAndReload}
                className="w-full h-8 text-[11px] font-semibold text-stone-500 hover:text-stone-800 hover:bg-amber-100/50 rounded-lg cursor-pointer flex items-center justify-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Xóa cache & Lấy phiên bản mới nhất
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
