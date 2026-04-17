"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { resolveClientUser } from "@/utils/supabase/authClient";
import { shouldHideGlobalChrome } from "@/lib/authRoutes";

type OwnerReportBannerRow = {
  id: string;
  license_plate: string;
  location_description: string;
  status: "pending" | "chatting" | "email_sent";
  created_at: string;
  email_sent_at: string | null;
};

function formatCountdown(createdAt: string, nowMs: number) {
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) return "1:00";

  const elapsed = Math.floor((nowMs - createdMs) / 1000);
  const remaining = Math.max(0, 60 - elapsed);
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function formatStageTwoCountdown(emailSentAt: string, nowMs: number) {
  const emailSentMs = new Date(emailSentAt).getTime();
  if (Number.isNaN(emailSentMs)) return "1:00";

  const elapsed = Math.floor((nowMs - emailSentMs) / 1000);
  const remaining = Math.max(0, 60 - elapsed);
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function ParkingOwnerBanner() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState("");
  const [reports, setReports] = useState<OwnerReportBannerRow[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [isResolving, setIsResolving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setInterval(() => setCurrentTimeMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const syncServerClock = useCallback(async () => {
    const { data, error } = await supabase.rpc("parking_server_now");
    if (error) return;

    const row = Array.isArray(data) ? data[0] : data;
    const serverNowValue =
      row && typeof row === "object" && "server_now" in row
        ? String((row as { server_now?: string }).server_now || "")
        : String(row || "");
    const serverNowMs = new Date(serverNowValue).getTime();
    if (!Number.isFinite(serverNowMs)) return;

    setServerClockOffsetMs(serverNowMs - Date.now());
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;

    const syncUser = async () => {
      const { user } = await resolveClientUser(supabase);
      if (!isMounted) return;

      setUserId(user?.id || "");
    };

    void syncUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void syncUser();
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!userId) {
      setReports([]);
      return;
    }

    let isMounted = true;

    const loadReports = async () => {
      const { data, error } = await supabase
        .from("parking_reports")
        .select("id, license_plate, location_description, status, created_at, email_sent_at")
        .eq("matched_owner_id", userId)
        .in("status", ["pending", "chatting", "email_sent"])
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!isMounted) return;
      if (error) {
        if (error.code === "42P01") {
          setReports([]);
          return;
        }
        return;
      }

      setReports((data || []) as OwnerReportBannerRow[]);
    };

    loadReports();
    const poll = window.setInterval(() => {
      loadReports();
    }, 2000);

    const channel = supabase
      .channel(`parking-owner-banner-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parking_reports",
          filter: `matched_owner_id=eq.${userId}`,
        },
        () => {
          loadReports();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  useEffect(() => {
    if (!userId) return;

    void syncServerClock();
    const timer = window.setInterval(() => {
      void syncServerClock();
    }, 60000);

    return () => window.clearInterval(timer);
  }, [userId, syncServerClock]);

  const activeReport = reports[0] || null;
  const synchronizedNowMs = currentTimeMs + serverClockOffsetMs;

  if (!pathname) return null;
  if (shouldHideGlobalChrome(pathname) || pathname.startsWith("/resolve")) return null;
  if (pathname.startsWith("/profile/reports")) return null;
  if (!activeReport) return null;

  const canAcknowledge =
    activeReport.status === "pending" ||
    activeReport.status === "chatting" ||
    activeReport.status === "email_sent";
  const createdAtMs = new Date(activeReport.created_at).getTime();
  const emailSentAtMs = new Date(String(activeReport.email_sent_at || "")).getTime();
  const elapsedSeconds = Number.isFinite(createdAtMs)
    ? Math.max(0, Math.floor((synchronizedNowMs - createdAtMs) / 1000))
    : 0;
  const chatClosed = elapsedSeconds >= 60;
  const hasEmailSentAt = Number.isFinite(emailSentAtMs);
  const emailCountdownActive = activeReport.status === "email_sent" && hasEmailSentAt;
  const emailElapsedSeconds = hasEmailSentAt
    ? Math.max(0, Math.floor((synchronizedNowMs - emailSentAtMs) / 1000))
    : 0;
  const stage = emailCountdownActive && emailElapsedSeconds >= 60 ? 3 : chatClosed ? 2 : 1;
  const countdownText = stage === 1
    ? formatCountdown(activeReport.created_at, synchronizedNowMs)
    : stage === 2 && emailCountdownActive
      ? formatStageTwoCountdown(String(activeReport.email_sent_at || ""), synchronizedNowMs)
      : "-";
  const stageLabel =
    stage === 1
      ? "Stage 1 - Owner response live"
      : stage === 2 && !emailCountdownActive
        ? "Stage 2 - Escalation email dispatching"
        : stage === 2
          ? "Stage 2 - Email sent, call unlock in 1 minute"
        : "Stage 3 - Reporter can call";
  const stageContainerClass =
    stage === 1
      ? "border-green-500/20 bg-green-500/10"
      : stage === 2
        ? "border-amber-500/20 bg-amber-500/10"
        : "border-red-500/20 bg-red-500/10";
  const leftBorderClass =
    stage === 1 ? "bg-green-400" : stage === 2 ? "bg-[#f5a623]" : "bg-red-400";
  const actionClass =
    stage === 1
      ? "border-green-500/20 text-green-300"
      : stage === 2
        ? "border-amber-500/20 text-amber-200"
        : "border-red-500/20 text-red-200";

  const handleImMoving = async () => {
    if (!activeReport?.id) return;
    setIsResolving(true);
    setErrorMessage("");

    const { error } = await supabase.rpc("parking_owner_im_moving", {
      _report_id: activeReport.id,
    });

    if (error) {
      setErrorMessage(error.message || "Unable to acknowledge this report.");
    } else {
      setReports((prev) => prev.filter((report) => report.id !== activeReport.id));
    }

    setIsResolving(false);
  };

  return (
    <div className="fixed left-0 right-0 top-[84px] z-[95] px-2 sm:px-3">
      <div className={`relative w-full rounded-xl border px-3 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-md sm:px-4 ${stageContainerClass}`}>
        <span className={`absolute inset-y-0 left-0 w-1 animate-pulse ${leftBorderClass}`} />
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold tracking-wider text-white/90 sm:text-sm">
              {activeReport.license_plate} - {activeReport.location_description}
            </p>
            <p className="mt-1 text-[11px] text-white/70">{stageLabel}</p>
            {errorMessage ? <p className="mt-1 text-xs text-red-200">{errorMessage}</p> : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${actionClass}`}>
              <Clock3 className="h-3 w-3" />
              {countdownText}
            </span>
            <Link
              href={`/parking-patrol?report=${activeReport.id}`}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-white/15 px-3 text-xs font-bold text-white"
            >
              Respond &gt;
            </Link>
            {canAcknowledge ? (
              <button
                type="button"
                onClick={handleImMoving}
                disabled={isResolving}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-green-400/20 bg-green-500/15 px-3 text-xs font-bold text-green-200 disabled:opacity-60"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isResolving ? "..." : "I'm Moving"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
