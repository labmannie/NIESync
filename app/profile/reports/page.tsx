"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Download, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { type ParkingStatus } from "@/lib/parkingReportPermissions";

type ParkingReportRow = {
  id: string;
  reported_by: string | null;
  license_plate: string;
  location_description: string;
  matched_owner_id: string | null;
  status: ParkingStatus;
  resolved_at: string | null;
  created_at: string;
};

type ParkingMessageRow = {
  id: string;
  report_id: string;
  sender_id: string | null;
  sender_role: "reporter" | "owner" | "system";
  message: string;
  created_at: string;
};

function formatElapsed(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getRoleLabel(message: ParkingMessageRow, isReporter: boolean, isOwner: boolean) {
  if (message.sender_role === "system") return "System";
  if (isReporter) return message.sender_role === "reporter" ? "You" : "Vehicle Owner";
  if (isOwner) return message.sender_role === "owner" ? "You" : "Reporter";
  return message.sender_role === "owner" ? "Vehicle Owner" : "Reporter";
}

function ProfileReportsArchivePageContent() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  const [userId, setUserId] = useState("");
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [reports, setReports] = useState<ParkingReportRow[]>([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [messages, setMessages] = useState<ParkingMessageRow[]>([]);
  const [schemaError, setSchemaError] = useState("");
  const [loadError, setLoadError] = useState("");

  const reportIdFromQuery = searchParams.get("report") || "";

  const loadReports = useCallback(async () => {
    setIsLoadingReports(true);
    setSchemaError("");
    setLoadError("");

    const { data, error } = await supabase
      .from("parking_reports")
      .select(
        "id, reported_by, license_plate, location_description, matched_owner_id, status, resolved_at, created_at"
      )
      .in("status", ["resolved", "unmatched"])
      .order("created_at", { ascending: false })
      .limit(150);

    if (error) {
      if (error.code === "42P01") {
        setSchemaError(
          "Parking schema not found. Run Supabase migrations before using this module."
        );
      } else {
        setLoadError(error.message || "Unable to load archived reports.");
      }
      setReports([]);
      setIsLoadingReports(false);
      return;
    }

    const rows = (data || []) as ParkingReportRow[];
    setReports(rows);
    setSelectedReportId((current) => {
      if (reportIdFromQuery && rows.some((report) => report.id === reportIdFromQuery)) {
        return reportIdFromQuery;
      }
      if (current && rows.some((report) => report.id === current)) return current;
      return rows[0]?.id || "";
    });
    setIsLoadingReports(false);
  }, [supabase, reportIdFromQuery]);

  const loadMessages = useCallback(
    async (reportId: string) => {
      if (!reportId) {
        setMessages([]);
        return;
      }

      const { data, error } = await supabase
        .from("parking_report_messages")
        .select("id, report_id, sender_id, sender_role, message, created_at")
        .eq("report_id", reportId)
        .order("created_at", { ascending: true })
        .limit(300);

      if (error) {
        if (error.code !== "42P01") {
          setLoadError(error.message || "Unable to load report transcript.");
        }
        return;
      }

      setMessages((data || []) as ParkingMessageRow[]);
    },
    [supabase]
  );

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      setUserId(user?.id || "");
      await loadReports();
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, [supabase, loadReports]);

  useEffect(() => {
    if (!selectedReportId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedReportId);
  }, [selectedReportId, loadMessages]);

  useEffect(() => {
    if (!userId) return;

    const reportChannel = supabase
      .channel(`profile-resolved-reports-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parking_reports" },
        () => {
          void loadReports();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reportChannel);
    };
  }, [supabase, userId, loadReports]);

  const selectedReport = reports.find((report) => report.id === selectedReportId) || null;
  const isReporter = selectedReport?.reported_by === userId;
  const isOwner = selectedReport?.matched_owner_id === userId;

  const handleDownloadTranscript = () => {
    if (!selectedReport || messages.length === 0) return;
    const header = [
      `Report ID: ${selectedReport.id}`,
      `Plate: ${selectedReport.license_plate}`,
      `Reporter Note: ${selectedReport.location_description}`,
      `Status: ${selectedReport.status}`,
      `Created: ${new Date(selectedReport.created_at).toLocaleString()}`,
      `Resolved: ${selectedReport.resolved_at ? new Date(selectedReport.resolved_at).toLocaleString() : "N/A"}`,
      "",
      "Transcript",
      "----------",
    ];

    const body = messages.map((message) => {
      const label = getRoleLabel(message, Boolean(isReporter), Boolean(isOwner));
      return `[${new Date(message.created_at).toLocaleString()}] ${label}: ${message.message}`;
    });

    const content = [...header, ...body].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const filePlate = selectedReport.license_plate.replace(/[^A-Z0-9]+/gi, "_");
    const fileName = `parking-archive-${filePlate || "report"}-${selectedReport.id}.txt`;

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen w-full bg-campus-black px-4 pb-16 pt-32 text-white md:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.45)] md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="mt-1 text-2xl font-black tracking-tight md:text-4xl">
                Parking Report History
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-text-secondary md:text-base">
                Archived records only (resolved and unmatched). Live reports and live chat stay in Parking Patrol.
              </p>
            </div>
            <Link
              href="/parking-patrol"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition-colors hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
              Back To Live Patrol
            </Link>
          </div>
        </header>

        {schemaError ? (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {schemaError}
          </div>
        ) : null}
        {loadError ? (
          <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            <AlertCircle className="h-3.5 w-3.5" />
            {loadError}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <aside className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">
                Old Reports
              </h2>
              {isLoadingReports ? <Loader2 className="h-4 w-4 animate-spin text-white/50" /> : null}
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {isLoadingReports ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`resolved-report-skeleton-${index}`}
                    className="animate-pulse rounded-xl border border-white/10 bg-black/30 px-3 py-3"
                  >
                    <div className="h-4 w-2/5 rounded bg-white/10" />
                    <div className="mt-2 h-3 w-4/5 rounded bg-white/10" />
                    <div className="mt-3 h-2 w-1/4 rounded bg-white/10" />
                  </div>
                ))
              ) : reports.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-4 text-sm text-text-secondary">
                  No archived reports yet.
                </p>
              ) : (
                reports.map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => setSelectedReportId(report.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                      selectedReportId === report.id
                        ? "border-emerald-400/40 bg-emerald-500/15"
                        : "border-white/10 bg-black/30 hover:border-white/25"
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="font-mono text-sm font-semibold tracking-wider text-white">
                        {report.license_plate}
                      </p>
                      {report.status === "resolved" ? (
                        <span className="rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-200">
                          Resolved
                        </span>
                      ) : (
                        <span className="rounded-full border border-slate-400/35 bg-slate-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-200">
                          Unmatched
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-xs text-text-secondary">{report.location_description}</p>
                    <p className="mt-2 text-[10px] text-white/50">
                      {formatElapsed(report.resolved_at || report.created_at)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:p-6">
            {!selectedReport ? (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-text-secondary">
                Select an archived report to view transcript history.
              </p>
            ) : (
              <div className="space-y-4">
                <div
                  className={`rounded-2xl p-4 ${
                    selectedReport.status === "resolved"
                      ? "border border-emerald-400/35 bg-emerald-500/10"
                      : "border border-slate-400/35 bg-slate-500/10"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-mono text-lg font-bold tracking-wider">{selectedReport.license_plate}</p>
                      <p className="mt-1 text-xs text-white/80">
                        Reporter note: {selectedReport.location_description}
                      </p>
                      <p className="mt-1 text-[11px] text-white/70">
                        {selectedReport.status === "resolved"
                          ? `Resolved ${selectedReport.resolved_at
                              ? new Date(selectedReport.resolved_at).toLocaleString()
                              : "time unavailable"}`
                          : `Logged ${new Date(selectedReport.created_at).toLocaleString()}`}
                      </p>
                    </div>
                    {selectedReport.status === "resolved" ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 px-3 py-1 text-[11px] text-emerald-100">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Finished
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-slate-300/30 px-3 py-1 text-[11px] text-slate-100">
                        Unmatched
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                    {messages.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-xs text-text-secondary">
                        No transcript messages stored for this report.
                      </p>
                    ) : (
                      messages.map((message) => (
                        <div
                          key={message.id}
                          className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-secondary">
                              {getRoleLabel(message, Boolean(isReporter), Boolean(isOwner))}
                            </span>
                            <span className="text-[10px] text-white/40">
                              {formatElapsed(message.created_at)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-white/90">{message.message}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleDownloadTranscript}
                      disabled={messages.length === 0}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors hover:bg-white/20 disabled:opacity-60"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download transcript
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

export default function ProfileReportsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen w-full bg-campus-black px-4 pb-16 pt-32 text-white md:px-8">
          <div className="mx-auto w-full max-w-7xl animate-pulse space-y-6">
            <div className="h-28 rounded-3xl border border-white/10 bg-white/[0.03]" />
            <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
              <div className="h-[70vh] rounded-3xl border border-white/10 bg-white/[0.03]" />
              <div className="h-[70vh] rounded-3xl border border-white/10 bg-white/[0.03]" />
            </div>
          </div>
        </main>
      }
    >
      <ProfileReportsArchivePageContent />
    </Suspense>
  );
}
