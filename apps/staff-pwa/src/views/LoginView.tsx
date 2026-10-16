import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { AlertTriangle, Info } from "lucide-react";
import { getAuthToken } from "../lib/api-client";
import { fetchDemoStatus, switchDemoRole } from "../lib/demo-mode";
import { useRouter } from "../lib/router";

export const LoginView: React.FC = () => {
  const router = useRouter();
  const [demoEnabled, setDemoEnabled] = useState<boolean>(false);
  const [switchingRole, setSwitchingRole] = useState<string | null>(null);

  // Check if already authenticated or if Demo Mode is active on mount
  useEffect(() => {
    const token = getAuthToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch("/api/me", { credentials: "include", headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.user) {
          window.location.href = "/";
        }
      })
      .catch(() => {});

    fetchDemoStatus().then((status) => {
      if (status.enabled) {
        setDemoEnabled(true);
      }
    });
  }, []);

  const handleDemoQuickLogin = async (role: "ADMIN" | "PARTNER" | "USER") => {
    setSwitchingRole(role);
    try {
      const res = await switchDemoRole(role);
      if (!res.success) {
        toast.error(res.error || "Không thể khởi tạo phiên Demo");
        return;
      }
      if (role === "ADMIN") {
        window.location.href = "/admin";
      } else if (role === "PARTNER") {
        router.push("/staff-tasks");
      } else {
        router.push("/");
      }
    } finally {
      setSwitchingRole(null);
    }
  };

  // URL Error handling
  const [urlNotice, setUrlNotice] = useState<{
    type: "error" | "warning" | "info";
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const error = params.get("error");
      const email = params.get("email");

      if (error === "not_registered") {
        const msg = email
          ? `Tài khoản Google (${email}) chưa được cấp quyền truy cập. Vui lòng liên hệ Quản lý cửa hàng.`
          : "Tài khoản Google này chưa được cấp quyền truy cập. Vui lòng liên hệ Quản lý cửa hàng.";
        setUrlNotice({
          type: "error",
          title: "Chưa được cấp quyền truy cập",
          message: msg,
        });
        toast.error(msg);
      } else if (error === "cancelled") {
        const msg = "Bạn đã hủy quá trình đăng nhập qua Google.";
        setUrlNotice({
          type: "warning",
          title: "Đã hủy đăng nhập",
          message: msg,
        });
        toast.warning(msg);
      } else if (error === "inactive") {
        const msg = "Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ Quản lý.";
        setUrlNotice({
          type: "error",
          title: "Tài khoản bị vô hiệu hóa",
          message: msg,
        });
        toast.error(msg);
      } else if (error === "exchange_failed") {
        const msg = "Không thể xác thực mã truy cập với Google. Vui lòng thử lại sau.";
        setUrlNotice({
          type: "error",
          title: "Lỗi kết nối Google",
          message: msg,
        });
        toast.error(msg);
      } else if (error) {
        const msg = "Đăng nhập thất bại. Vui lòng thử lại.";
        setUrlNotice({
          type: "error",
          title: "Đăng nhập thất bại",
          message: msg,
        });
        toast.error(msg);
      }
    } catch {}
  }, []);

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center p-3 sm:p-4 relative bg-[#faf6f0] select-none"
      style={{
        backgroundImage: "url(/capybara_bg.webp)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-orange-50/75 backdrop-blur-xs"></div>

      <div className="w-full max-w-[400px] p-6 sm:p-7 text-center relative z-10 bg-white/95 border border-orange-100 shadow-2xl rounded-3xl animate-in fade-in zoom-in-95 duration-300">
        {/* Capybara Mascot Avatar */}
        <div className="mb-4 flex justify-center">
          <div className="h-24 w-24 overflow-hidden rounded-full bg-orange-100 shadow-lg border-4 border-orange-300 flex items-center justify-center">
            <img
              src="/capybara_mascot.webp"
              alt="Bé Capybara ngoại giao"
              width="96"
              height="96"
              decoding="async"
              fetchPriority="high"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.onerror = null;
                const target = e.currentTarget;
                if (!target.src.endsWith("/logo.png")) {
                  target.src = "/logo.png";
                }
              }}
            />
          </div>
        </div>

        <h1 className="mb-1 text-2xl font-extrabold text-orange-950 font-sans tracking-tight">
          Boop Boop!
        </h1>
        <p className="mb-5 text-xs text-orange-800/80 font-medium">
          Bạn hãy đăng nhập nhé 🍊
        </p>

        {/* URL Notice Banner */}
        {urlNotice && (
          <div
            className={`mb-4 p-3 rounded-2xl border text-xs text-left flex items-start gap-2.5 animate-in fade-in duration-200 ${
              urlNotice.type === "error"
                ? "bg-red-50 border-red-200 text-red-800"
                : urlNotice.type === "warning"
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-blue-50 border-blue-200 text-blue-800"
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {urlNotice.type === "error" ? (
                <AlertTriangle className="w-4 h-4 text-red-600" />
              ) : (
                <Info className="w-4 h-4 text-amber-600" />
              )}
            </div>
            <div>
              <p className="font-bold text-[11px] leading-tight mb-0.5">{urlNotice.title}</p>
              <p className="text-[11px] leading-relaxed opacity-90">{urlNotice.message}</p>
            </div>
          </div>
        )}

        {/* 1-Click Demo Experience Card */}
        {demoEnabled && (
          <div
            data-testid="demo-login-card"
            className="mb-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50/80 to-rose-50/60 p-3.5 text-left shadow-sm"
          >
            <p className="text-xs font-extrabold text-orange-950 mb-2 text-center">
              🚀 Chế độ Trải Nghiệm Demo (1-Click)
            </p>
            <div className="space-y-2">
              <button
                type="button"
                disabled={switchingRole !== null}
                onClick={() => handleDemoQuickLogin("ADMIN")}
                className="w-full rounded-xl border border-amber-300 bg-white hover:bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950 shadow-2xs transition-all cursor-pointer disabled:opacity-60"
              >
                👑 Xem Giao Diện Chủ Shop (Admin)
              </button>
              <button
                type="button"
                disabled={switchingRole !== null}
                onClick={() => handleDemoQuickLogin("PARTNER")}
                className="w-full rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-950 shadow-2xs transition-all cursor-pointer disabled:opacity-60"
              >
                📋 Xem Giao Diện Quản Lý (Partner)
              </button>
              <button
                type="button"
                disabled={switchingRole !== null}
                onClick={() => handleDemoQuickLogin("USER")}
                className="w-full rounded-xl border border-emerald-200 bg-white hover:bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-950 shadow-2xs transition-all cursor-pointer disabled:opacity-60"
              >
                👷 Xem Giao Diện Nhân Viên (Staff)
              </button>
            </div>
          </div>
        )}

        {/* Google Login Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          className="relative flex w-full items-center justify-center gap-3 rounded-2xl bg-[#e8f0fe] hover:bg-[#d2e3fc] px-4 py-3 text-xs sm:text-sm font-semibold text-[#1a73e8] transition-all hover:shadow-md cursor-pointer active:scale-98 border border-[#d2e3fc]"
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>Đăng nhập qua Google</span>
        </button>

        {/* Footer info */}
        <p className="mt-5 text-[10px] text-stone-400">
          Chấm công LimArt • Bảo mật & Đồng bộ thời gian thực
        </p>
      </div>
    </div>
  );
};

export default LoginView;
