"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type MobileToastKind = "success" | "error" | "info";

type MobileToastProps = {
  kind: MobileToastKind;
  message: string;
  open: boolean;
  onClose: () => void;
  durationMs?: number;
};

const KIND_STYLES: Record<MobileToastKind, { frame: string; icon: ReactNode }> = {
  success: {
    frame: "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
    icon: <CheckCircle2 className="h-4 w-4 shrink-0" />,
  },
  error: {
    frame: "border-red-400/35 bg-red-500/15 text-red-100",
    icon: <AlertCircle className="h-4 w-4 shrink-0" />,
  },
  info: {
    frame: "border-sky-400/35 bg-sky-500/15 text-sky-100",
    icon: <Info className="h-4 w-4 shrink-0" />,
  },
};

export function MobileToast({
  kind,
  message,
  open,
  onClose,
  durationMs = 2800,
}: MobileToastProps) {
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => onClose(), durationMs);
    return () => window.clearTimeout(timer);
  }, [open, onClose, durationMs]);

  const style = KIND_STYLES[kind];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[140] px-4 md:hidden">
      <AnimatePresence>
        {open && message ? (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className={`pointer-events-auto mx-auto flex w-full max-w-md items-start gap-2 rounded-xl border px-3 py-2 text-sm shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-md ${style.frame}`}
          >
            {style.icon}
            <p className="min-w-0 flex-1 leading-snug">{message}</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/20 p-1 text-white/80"
              aria-label="Close toast"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
