"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type OwnerReportBannerRow = {
  id: string;
  license_plate: string;
  location_description: string;
  status: "pending" | "chatting" | "email_sent";
  created_at: string;
  email_sent_at: string | null;
};

const HIDDEN_ROUTES = [
  "/login",
  "/signup",
  "/signup/complete",
  "/forgot-password",
  "/reset-password",
];

function formatCountdown(createdAt: string, nowMs: number) {
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) return "2:00";

  const elapsed = Math.floor((nowMs - createdMs) / 1000);
  const remaining = Math.max(0, 120 - elapsed);
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

    const bootstrap = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!isMounted) return;

      setUserId(user?.id || "");
    };

    bootstrap();
    return () => {
      isMounted = false;
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
    }, 30000);

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
  if (pathname.startsWith("/auth") || pathname.startsWith("/resolve")) return null;
  if (pathname.startsWith("/profile/reports")) return null;
  if (HIDDEN_ROUTES.includes(pathname)) return null;
  if (!activeReport) return null;

  const countdownVisible =
    activeReport.status === "pending" || activeReport.status === "chatting";
  const canAcknowledge =
    activeReport.status === "pending" ||
    activeReport.status === "chatting" ||
    activeReport.status === "email_sent";
  const createdAtMs = new Date(activeReport.created_at).getTime();
  const isChatWindowClosed = Number.isFinite(createdAtMs)
    ? synchronizedNowMs - createdAtMs >= 2 * 60 * 1000
    : false;
  const countdownText = formatCountdown(activeReport.created_at, synchronizedNowMs);
  const stageLabel =
    activeReport.status === "email_sent"
      ? "Chat window closed. Escalation is active."
      : isChatWindowClosed
        ? "Chat window closed. Escalation is active."
        : activeReport.status === "pending"
          ? "Waiting for your response"
          : "Chat is active";

  const handleImMoving = async () => {
    if (!activeReport?.id) return;
    setIsResolving(true);
    setErrorMessage("");

    const { error } = await supabase.rpc("parking_owner_im_moving", {
      _report_id: activeReport.id,
    });

    if (error) {
      setErrorMessage(error.message || "Unable to acknowledge this report.");
    }

    setIsResolving(false);
  };

  return (
    <div className="fixed left-0 right-0 top-[84px] z-[95] px-4 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-white shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full border border-amber-200/40 bg-amber-300/20 p-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-200" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              Your vehicle <span className="font-mono">{activeReport.license_plate}</span> was reported.
              <span className="ml-1 text-amber-100/90">Note: {activeReport.location_description}</span>
            </p>
            <p className="mt-0.5 text-xs text-amber-100/90">
              {stageLabel}
              {countdownVisible ? (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-200/30 px-2 py-0.5 text-[11px]">
                  <Clock3 className="h-3 w-3" /> {countdownText}
                </span>
              ) : null}
            </p>
            {errorMessage ? (
              <p className="mt-1 text-xs text-red-200">{errorMessage}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/parking-patrol?report=${activeReport.id}`}
            className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors hover:bg-white/20"
          >
            Open Report
          </Link>
          {canAcknowledge ? (
            <button
              type="button"
              onClick={handleImMoving}
              disabled={isResolving}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-500/20 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-100 transition-colors hover:bg-emerald-500/30 disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isResolving ? "Updating..." : "I'm Moving"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
