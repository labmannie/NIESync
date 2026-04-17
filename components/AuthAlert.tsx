import { AlertCircle, Info, Shield } from "lucide-react";
import { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AuthAlertProps = {
  children: ReactNode;
  kind?: "error" | "success" | "info";
  className?: string;
};

const toneStyles = {
  error: {
    icon: AlertCircle,
    className: "border-red-500/30 bg-red-500/10 text-red-100",
  },
  success: {
    icon: Shield,
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  },
  info: {
    icon: Info,
    className: "border-white/10 bg-white/[0.04] text-white/78",
  },
};

export function AuthAlert({
  children,
  kind = "info",
  className,
}: AuthAlertProps) {
  const Icon = toneStyles[kind].icon;

  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-[22px] border px-4 py-3 text-sm leading-6",
        toneStyles[kind].className,
        className
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
