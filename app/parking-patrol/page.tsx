"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Loader2,
  PhoneCall,
  RadioTower,
  Send,
  ShieldAlert,
  UploadCloud,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import {
  formatParkingReportPlateInput,
  normalizeParkingReportPlateForSubmission,
  validateParkingReportPlate,
} from "@/lib/vehiclePlate";
import {
  ownerImMovingAction,
  reporterMarkUnresolvedAction,
  reporterMarkResolvedAction,
  revealParkingPhoneAction,
  sendParkingMessageAction,
  submitParkingReportAction,
} from "@/app/parking-patrol/actions";
import {
  canOwnerAcknowledgeReport,
  canReporterMarkUnresolved,
  canReporterResolveReport,
  canReporterRevealOwnerPhone,
  isChatWindowOpen,
  type ParkingStatus,
} from "@/lib/parkingReportPermissions";

type ParkingReportRow = {
  id: string;
  reported_by: string | null;
  license_plate: string;
  plate_normalized: string;
  location_description: string;
  matched_owner_id: string | null;
  status: ParkingStatus;
  phone_revealed: boolean;
  email_sent_at: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  photo_url: string | null;
  ocr_raw_text: string | null;
};

type ParkingMessageRow = {
  id: string;
  report_id: string;
  sender_id: string | null;
  sender_role: "reporter" | "owner" | "system";
  message: string;
  created_at: string;
};

type UnmatchedReportSnapshot = {
  reportId: string;
  plate: string;
  location: string;
  reportedAtIso: string;
};

type TesseractRecognizer = {
  recognize: (
    image: Blob,
    language?: string,
    options?: {
      logger?: (message: { status?: string; progress?: number }) => void;
    }
  ) => Promise<{ data: { text: string } }>;
};

declare global {
  interface Window {
    Tesseract?: TesseractRecognizer;
  }
}

const COMMON_LOCATION_ZONES = [
  "Library Gate",
  "Admin Block Entrance",
  "North Campus Main Road",
  "South Campus Parking Bay",
  "Mechanical Block Lane",
  "ECE Block Side Road",
];

const STATUS_THEME: Record<ParkingStatus, string> = {
  pending: "border-yellow-400/35 bg-yellow-500/15 text-yellow-200",
  chatting: "border-blue-400/35 bg-blue-500/15 text-blue-200",
  acknowledged: "border-emerald-400/35 bg-emerald-500/15 text-emerald-200",
  email_sent: "border-indigo-400/35 bg-indigo-500/15 text-indigo-200",
  resolved: "border-green-400/35 bg-green-500/15 text-green-200",
  unmatched: "border-slate-400/35 bg-slate-500/15 text-slate-200",
  expired: "border-red-400/35 bg-red-500/15 text-red-200",
};

let tesseractScriptPromise: Promise<TesseractRecognizer> | null = null;

function loadTesseractRecognizer() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OCR is only available in browser context."));
  }
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractScriptPromise) return tesseractScriptPromise;

  tesseractScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-tesseract-loader="true"]'
    ) as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener("load", () => {
        if (window.Tesseract) resolve(window.Tesseract);
        else reject(new Error("Tesseract loaded but not initialized."));
      });
      existing.addEventListener("error", () => reject(new Error("Unable to load OCR engine.")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.async = true;
    script.dataset.tesseractLoader = "true";
    script.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract);
      else reject(new Error("OCR engine did not initialize."));
    };
    script.onerror = () => reject(new Error("Failed to load OCR script."));
    document.head.appendChild(script);
  });

  return tesseractScriptPromise;
}

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

function formatTwoMinuteCountdown(createdAt: string, nowMs: number) {
  const startedMs = new Date(createdAt).getTime();
  if (Number.isNaN(startedMs)) return "2:00";
  const elapsed = Math.floor((nowMs - startedMs) / 1000);
  const remaining = Math.max(0, 120 - elapsed);
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function formatFiveMinuteCountdown(startedAt: string, nowMs: number) {
  const startedMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedMs)) return "5:00";
  const elapsed = Math.floor((nowMs - startedMs) / 1000);
  const remaining = Math.max(0, 300 - elapsed);
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function buildUnmatchedCopyText(report: UnmatchedReportSnapshot) {
  const shortId = (String(report.reportId || "").slice(0, 8).toUpperCase() || "UNKNOWN");
  const reportedAtText = new Date(report.reportedAtIso).toLocaleString();

  return [
    "NIE Campus Sync - Unregistered Vehicle Report",
    `Plate: ${report.plate}`,
    `Location: ${report.location}`,
    `Reported at: ${reportedAtText}`,
    `Report ID: #${shortId}`,
    "This vehicle is not registered. Please contact campus security or place a physical notice on the vehicle.",
  ].join("\n");
}

function getThreadRoleLabel(
  message: ParkingMessageRow,
  isReporter: boolean,
  isOwner: boolean
) {
  if (message.sender_role === "system") return "System";
  if (isReporter) return message.sender_role === "reporter" ? "You" : "Vehicle Owner";
  if (isOwner) return message.sender_role === "owner" ? "You" : "Reporter";
  return message.sender_role === "owner" ? "Vehicle Owner" : "Reporter";
}

function ParkingPatrolPageContent() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  const [userId, setUserId] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [reports, setReports] = useState<ParkingReportRow[]>([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [messages, setMessages] = useState<ParkingMessageRow[]>([]);
  const [schemaError, setSchemaError] = useState("");

  const [reportPanelOpen, setReportPanelOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [ocrRawText, setOcrRawText] = useState("");
  const [isRunningOcr, setIsRunningOcr] = useState(false);
  const [plateInput, setPlateInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [copyDetailsMessage, setCopyDetailsMessage] = useState("");
  const [unmatchedReport, setUnmatchedReport] = useState<UnmatchedReportSnapshot | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [threadDraft, setThreadDraft] = useState("");
  const [threadActionError, setThreadActionError] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isMarkingUnresolved, setIsMarkingUnresolved] = useState(false);
  const [isCallingOwner, setIsCallingOwner] = useState(false);
  const [revealedPhoneByReport, setRevealedPhoneByReport] = useState<Record<string, string>>(
    {}
  );
  const [clockMs, setClockMs] = useState(() => Date.now());

  const reportIdFromQuery = searchParams.get("report") || "";

  const loadReports = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setIsLoadingReports(true);
    }

    const { data, error } = await supabase
      .from("parking_reports")
      .select(
        "id, reported_by, license_plate, plate_normalized, location_description, matched_owner_id, status, phone_revealed, email_sent_at, acknowledged_at, resolved_at, created_at, photo_url, ocr_raw_text"
      )
      .in("status", ["pending", "chatting", "acknowledged", "email_sent"])
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      if (error.code === "42P01") {
        setSchemaError(
          "Parking schema not found. Run Supabase migrations before using this module."
        );
      } else {
        setSchemaError(error.message || "Unable to load reports.");
      }
      setReports([]);
      if (showLoader) {
        setIsLoadingReports(false);
      }
      return;
    }

    setSchemaError("");
    const rows = (data || []) as ParkingReportRow[];
    setReports(rows);
    setSelectedReportId((current) => {
      if (reportIdFromQuery && rows.some((report) => report.id === reportIdFromQuery)) {
        return reportIdFromQuery;
      }
      if (current && rows.some((report) => report.id === current)) return current;
      return rows[0]?.id || "";
    });

    if (showLoader) {
      setIsLoadingReports(false);
    }
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
        .limit(200);

      if (error) {
        if (error.code !== "42P01") {
          setThreadActionError(error.message || "Unable to load chat thread.");
        }
        return;
      }

      setMessages((data || []) as ParkingMessageRow[]);
    },
    [supabase]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;
      setUserId(user?.id || "");
      setIsLoggedIn(Boolean(user?.id));
      await loadReports(true);
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
      .channel(`parking-report-stream-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parking_reports" },
        () => {
          void loadReports(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reportChannel);
    };
  }, [supabase, userId, loadReports]);

  useEffect(() => {
    if (!selectedReportId) return;

    const messageChannel = supabase
      .channel(`parking-report-messages-${selectedReportId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parking_report_messages",
          filter: `report_id=eq.${selectedReportId}`,
        },
        () => {
          void loadMessages(selectedReportId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
    };
  }, [supabase, selectedReportId, loadMessages]);

  const selectedReport = reports.find((report) => report.id === selectedReportId) || null;
  const isReporter = selectedReport?.reported_by === userId;
  const isOwner = selectedReport?.matched_owner_id === userId;
  const chatWindowOpen = isChatWindowOpen(selectedReport, clockMs);
  const isChatReadOnly = Boolean(
    !selectedReport ||
      selectedReport.status === "unmatched" ||
      selectedReport.status === "resolved" ||
      !chatWindowOpen
  );

  const canOwnerAcknowledge = canOwnerAcknowledgeReport(selectedReport, userId);
  const canReporterResolve = canReporterResolveReport(selectedReport, userId);
  const canMarkUnresolved = canReporterMarkUnresolved(selectedReport, userId, clockMs);
  const canCallOwner = canReporterRevealOwnerPhone(selectedReport, userId, clockMs);
  const ownerPhone = selectedReport ? revealedPhoneByReport[selectedReport.id] || "" : "";
  const unresolvedCountdown = selectedReport?.acknowledged_at
    ? formatFiveMinuteCountdown(selectedReport.acknowledged_at, clockMs)
    : "5:00";

  const runOcr = async (file: File) => {
    setIsRunningOcr(true);
    setSubmitError("");
    setSubmitMessage("");

    try {
      const recognizer = await loadTesseractRecognizer();
      const result = await recognizer.recognize(file, "eng");

      const extractedText = String(result?.data?.text || "").trim();
      setOcrRawText(extractedText);

      const normalized = normalizeParkingReportPlateForSubmission({
        manualPlate: "",
        ocrRawText: extractedText,
      });
      const fallbackFormatted = formatParkingReportPlateInput(extractedText);
      const plateToApply = normalized.plate || fallbackFormatted;
      if (plateToApply) {
        setPlateInput(plateToApply);
        setSubmitMessage("Plate extracted from photo. You can edit it before submitting.");
      } else {
        setSubmitError("Could not detect a clear plate from the image. Please enter it manually.");
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to run OCR right now. Please enter plate manually."
      );
    } finally {
      setIsRunningOcr(false);
    }
  };

  const handlePhotoChange = async (file: File | null) => {
    if (!file) return;

    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }

    const previewUrl = URL.createObjectURL(file);
    setPhotoFile(file);
    setPhotoPreview(previewUrl);
    await runOcr(file);
  };

  const handleSubmitReport = async () => {
    setSubmitError("");
    setSubmitMessage("");
    setCopyDetailsMessage("");
    setUnmatchedReport(null);
    setThreadActionError("");

    const locationValue = locationInput.trim();

    if (!locationValue) {
      setSubmitError("Please describe where the vehicle is blocking movement.");
      return;
    }

    const plateValidation = validateParkingReportPlate(plateInput);
    if (plateValidation.error) {
      setSubmitError(plateValidation.error);
      return;
    }

    setIsSubmitting(true);
    const payload = new FormData();
    if (photoFile) payload.append("photo", photoFile);
    payload.append("location_description", locationValue);
    payload.append("plate_input", plateInput.trim());
    payload.append("ocr_raw_text", ocrRawText.trim());

    const result = await submitParkingReportAction(payload);
    setIsSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error || "Unable to submit report.");
      return;
    }

    if (result.unmatched) {
      const finalPlate = String(result.plate || plateValidation.plate || plateInput || "")
        .trim()
        .toUpperCase();
      setSubmitMessage(
        `Vehicle ${finalPlate} is not registered in NIE Campus Sync.\nYour report has been logged. Please handle this physically.`
      );
      setUnmatchedReport({
        reportId: String(result.reportId || ""),
        plate: finalPlate,
        location: locationValue,
        reportedAtIso: new Date().toISOString(),
      });
    } else {
      setSubmitMessage("Report submitted successfully. The vehicle owner has been notified.");
      setUnmatchedReport(null);
    }

    setPlateInput("");
    setLocationInput("");
    setOcrRawText("");
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview("");
    setReportPanelOpen(false);

    await loadReports();
    if (result.reportId && !result.unmatched) {
      setSelectedReportId(result.reportId);
    } else {
      setSelectedReportId("");
    }
  };

  const handleCopyUnmatchedDetails = async () => {
    if (!unmatchedReport) return;

    try {
      const text = buildUnmatchedCopyText(unmatchedReport);
      await navigator.clipboard.writeText(text);
      setCopyDetailsMessage("Report details copied.");
    } catch {
      setCopyDetailsMessage("Clipboard is unavailable. Please copy manually.");
    }
  };

  const handleSendThreadMessage = async () => {
    if (!selectedReport || !threadDraft.trim()) return;
    if (isChatReadOnly) {
      setThreadActionError("Chat window is closed for this report.");
      return;
    }

    setIsSendingMessage(true);
    setThreadActionError("");
    const response = await sendParkingMessageAction(selectedReport.id, threadDraft.trim());
    setIsSendingMessage(false);

    if (!response.ok) {
      setThreadActionError(response.error || "Unable to send message.");
      return;
    }

    setThreadDraft("");
    await loadMessages(selectedReport.id);
    await loadReports();
  };

  const handleOwnerAcknowledge = async () => {
    if (!selectedReport) return;
    setIsAcknowledging(true);
    setThreadActionError("");

    const result = await ownerImMovingAction(selectedReport.id);
    setIsAcknowledging(false);

    if (!result.ok) {
      setThreadActionError(result.error || "Unable to acknowledge movement.");
      return;
    }

    await loadReports();
    await loadMessages(selectedReport.id);
  };

  const handleReporterResolve = async () => {
    if (!selectedReport) return;
    setIsResolving(true);
    setThreadActionError("");

    const result = await reporterMarkResolvedAction(selectedReport.id);
    setIsResolving(false);

    if (!result.ok) {
      setThreadActionError(result.error || "Unable to mark resolved.");
      return;
    }

    await loadReports();
    await loadMessages(selectedReport.id);
  };

  const handleReporterMarkUnresolved = async () => {
    if (!selectedReport) return;
    setIsMarkingUnresolved(true);
    setThreadActionError("");

    const result = await reporterMarkUnresolvedAction(selectedReport.id);
    setIsMarkingUnresolved(false);

    if (!result.ok) {
      setThreadActionError(result.error || "Unable to mark unresolved.");
      return;
    }

    await loadReports();
    await loadMessages(selectedReport.id);
  };

  const handleRevealAndCall = async () => {
    if (!selectedReport) return;
    setIsCallingOwner(true);
    setThreadActionError("");

    const result = await revealParkingPhoneAction(selectedReport.id);
    setIsCallingOwner(false);

    if (!result.ok) {
      setThreadActionError(result.error || "Phone reveal is not available yet.");
      return;
    }

    const phone = String(result.phone || "");
    if (!phone) {
      setThreadActionError("Owner phone number was not found.");
      return;
    }

    setRevealedPhoneByReport((prev) => ({ ...prev, [selectedReport.id]: phone }));
    await loadReports();
    await loadMessages(selectedReport.id);

    if (typeof window !== "undefined") {
      window.location.href = `tel:${phone}`;
    }
  };

  const handleDownloadTranscript = () => {
    if (!selectedReport || messages.length === 0) return;
    const header = [
      `Report ID: ${selectedReport.id}`,
      `Plate: ${selectedReport.license_plate}`,
      `Reporter Note: ${selectedReport.location_description}`,
      `Status: ${selectedReport.status}`,
      `Created: ${new Date(selectedReport.created_at).toLocaleString()}`,
      "",
      "Transcript",
      "----------",
    ];

    const body = messages.map((message) => {
      const label = getThreadRoleLabel(message, Boolean(isReporter), Boolean(isOwner));
      return `[${new Date(message.created_at).toLocaleString()}] ${label}: ${message.message}`;
    });

    const content = [...header, ...body].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const filePlate = selectedReport.license_plate.replace(/[^A-Z0-9]+/gi, "_");
    const fileName = `parking-transcript-${filePlate || "report"}-${selectedReport.id}.txt`;

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
                Parking Patrol
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-text-secondary md:text-base">
                Live reporting and live chat operations for parking incidents.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-text-secondary">
                <RadioTower className="h-4 w-4 text-accent-amber" />
                Live Incident Channel
              </div>
              <Link
                href="/profile/reports"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition-colors hover:bg-white/20"
              >
                History Archive
              </Link>
            </div>
          </div>
        </header>

        {schemaError ? (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {schemaError}
          </div>
        ) : null}

        <section className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-text-secondary">
                  Live Incident
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  One live report thread at a time. Unmatched and finished reports stay in profile history.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
                {isLoadingReports ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {reports.length} Active
              </span>
            </div>
            {selectedReport ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm font-bold tracking-wider">{selectedReport.license_plate}</p>
                  <span className="text-[11px] text-white/60">{formatElapsed(selectedReport.created_at)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                  {selectedReport.location_description}
                </p>
              </div>
            ) : null}
          </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-text-secondary">
                    Report Blocking Vehicle
                  </h2>
                  <p className="mt-2 text-sm text-text-secondary">
                    Enter plate, optionally upload photo for extraction, and submit.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReportPanelOpen((current) => !current)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-accent-amber bg-accent-amber px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-campus-black shadow-[0_8px_24px_rgba(231,178,30,0.25)] transition-transform hover:scale-[1.01] hover:bg-[#e7b21e] sm:w-auto"
                >
                  <ShieldAlert className="h-4 w-4" />
                  {reportPanelOpen ? "Hide Report Form" : "Open Report Form"}
                </button>
              </div>
              {!reportPanelOpen ? (
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-accent-amber">
                  Report form is hidden. Tap Open Report Form to start a new report.
                </p>
              ) : null}

              {submitMessage ? (
                <p className="mt-4 inline-flex items-center gap-2 whitespace-pre-line rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {submitMessage}
                </p>
              ) : null}
              {submitError ? (
                <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {submitError}
                </p>
              ) : null}
              {unmatchedReport ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={handleCopyUnmatchedDetails}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-accent-amber bg-accent-amber px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-campus-black transition-colors hover:bg-[#e7b21e]"
                  >
                    <Copy className="h-4 w-4" />
                    Copy Report Details
                  </button>
                  {copyDetailsMessage ? (
                    <p className="text-xs font-semibold text-accent-amber">{copyDetailsMessage}</p>
                  ) : null}
                </div>
              ) : null}

              {reportPanelOpen ? (
                <div className="mt-5 space-y-5 rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5">
                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-[0.16em] text-text-secondary">
                      Vehicle Plate
                    </label>
                    <input
                      type="text"
                      value={plateInput}
                      onChange={(event) =>
                        setPlateInput(formatParkingReportPlateInput(event.target.value))
                      }
                      placeholder="KA-09-AB-1234"
                      className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-base font-mono tracking-widest text-white outline-none transition-colors placeholder:text-white/30 focus:border-accent-amber/60"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-[0.16em] text-text-secondary">
                      Photo (Optional)
                    </label>
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-4 text-xs font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-white/[0.06]">
                      <Camera className="h-4 w-4 text-accent-amber" />
                      {isRunningOcr ? "Extracting plate..." : "Upload or capture photo"}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          void handlePhotoChange(file);
                        }}
                      />
                    </label>
                    {photoPreview ? (
                      <div className="overflow-hidden rounded-xl border border-white/10">
                        <img
                          src={photoPreview}
                          alt="Incident preview"
                          className="h-52 w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.01] text-xs text-text-secondary">
                        Photo preview appears here
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-[0.16em] text-text-secondary">
                      Location / Reporter Note
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {COMMON_LOCATION_ZONES.map((zone) => (
                        <button
                          key={zone}
                          type="button"
                          onClick={() => setLocationInput(zone)}
                          className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                            locationInput === zone
                              ? "border-accent-amber/50 bg-accent-amber/20 text-accent-amber"
                              : "border-white/15 bg-white/[0.03] text-text-secondary hover:text-white"
                          }`}
                        >
                          {zone}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={locationInput}
                      onChange={(event) => setLocationInput(event.target.value)}
                      placeholder="Example: You have blocked my bike exit near Library Gate."
                      rows={4}
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-accent-amber/60"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSubmitReport}
                    disabled={isSubmitting || !isLoggedIn}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] transition-colors hover:bg-white/20 disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UploadCloud className="h-4 w-4" />
                    )}
                    {isSubmitting ? "Submitting..." : "Submit Incident Report"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-text-secondary">
                  Live Incident Thread
                </h2>
                {selectedReport ? (
                  <span
                    className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${STATUS_THEME[selectedReport.status]}`}
                  >
                    {selectedReport.status.replace("_", " ")}
                  </span>
                ) : null}
              </div>

              {!selectedReport ? (
                isLoadingReports ? (
                  <div className="animate-pulse space-y-3">
                    <div className="h-16 rounded-xl bg-white/10" />
                    <div className="h-28 rounded-xl bg-white/10" />
                    <div className="h-12 rounded-xl bg-white/10" />
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-text-secondary">
                    No live report is active for your account right now.
                  </p>
                )
              ) : (
                <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-mono text-lg font-bold tracking-wider">
                        {selectedReport.license_plate}
                      </p>
                      <p className="mt-1 text-xs text-text-secondary">
                        Reporter note: {selectedReport.location_description}
                      </p>
                      <p className="mt-1 text-[11px] text-white/50">
                        Created {formatElapsed(selectedReport.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(selectedReport.status === "pending" ||
                        selectedReport.status === "chatting") && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-[11px] text-text-secondary">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatTwoMinuteCountdown(selectedReport.created_at, clockMs)}
                        </span>
                      )}
                      <span
                        className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${STATUS_THEME[selectedReport.status]}`}
                      >
                        {selectedReport.status.replace("_", " ")}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {canOwnerAcknowledge ? (
                      <button
                        type="button"
                        onClick={handleOwnerAcknowledge}
                        disabled={isAcknowledging}
                        className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-100 transition-colors hover:bg-emerald-500/30 disabled:opacity-60"
                      >
                        {isAcknowledging ? "Updating..." : "I am moving"}
                      </button>
                    ) : null}

                    {canReporterResolve ? (
                      <button
                        type="button"
                        onClick={handleReporterResolve}
                        disabled={isResolving}
                        className="rounded-lg border border-green-400/40 bg-green-500/20 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-green-100 transition-colors hover:bg-green-500/30 disabled:opacity-60"
                      >
                        {isResolving ? "Resolving..." : "Mark resolved"}
                      </button>
                    ) : null}

                    {isReporter && selectedReport.status === "acknowledged" ? (
                      canMarkUnresolved ? (
                        <button
                          type="button"
                          onClick={handleReporterMarkUnresolved}
                          disabled={isMarkingUnresolved}
                          className="rounded-lg border border-amber-400/40 bg-amber-500/20 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-100 transition-colors hover:bg-amber-500/30 disabled:opacity-60"
                        >
                          {isMarkingUnresolved ? "Updating..." : "Still blocked (unresolved)"}
                        </button>
                      ) : (
                        <div className="flex items-center rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-100/90">
                          Unresolved opens in {unresolvedCountdown}
                        </div>
                      )
                    ) : null}

                    {canCallOwner ? (
                      <button
                        type="button"
                        onClick={handleRevealAndCall}
                        disabled={isCallingOwner}
                        className="rounded-lg border border-orange-400/40 bg-orange-500/20 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-orange-100 transition-colors hover:bg-orange-500/30 disabled:opacity-60"
                      >
                        {isCallingOwner ? "Revealing..." : "Reveal and call owner"}
                      </button>
                    ) : null}

                    {ownerPhone ? (
                      <a
                        href={`tel:${ownerPhone}`}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white"
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                        {ownerPhone}
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  {!chatWindowOpen &&
                  (selectedReport.status === "pending" ||
                    selectedReport.status === "chatting") ? (
                    <div className="mb-3 rounded-lg border border-indigo-400/35 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
                      Chat window closed after 2 minutes. Escalation stage is active.
                    </div>
                  ) : null}

                  <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                    {messages.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-xs text-text-secondary">
                        No messages in this thread yet.
                      </p>
                    ) : (
                      messages.map((message) => (
                        <div
                          key={message.id}
                          className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-secondary">
                              {getThreadRoleLabel(message, Boolean(isReporter), Boolean(isOwner))}
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

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={threadDraft}
                      onChange={(event) => setThreadDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleSendThreadMessage();
                        }
                      }}
                      placeholder="Send a message in this thread..."
                      disabled={isChatReadOnly || isSendingMessage}
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-accent-blue/60 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={handleSendThreadMessage}
                      disabled={isChatReadOnly || !threadDraft.trim() || isSendingMessage}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] transition-colors hover:bg-white/20 disabled:opacity-60"
                    >
                      {isSendingMessage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Send
                    </button>
                  </div>

                  {!chatWindowOpen || selectedReport.status === "resolved" ? (
                    <div className="mt-3">
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
                  ) : null}
                </div>

                {threadActionError ? (
                  <p className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {threadActionError}
                  </p>
                ) : null}
              </div>
            )}
            </div>
          </section>
      </div>
    </main>
  );
}

export default function ParkingPatrolPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen w-full bg-campus-black px-4 pb-16 pt-32 text-white md:px-8">
          <div className="mx-auto w-full max-w-7xl animate-pulse space-y-6">
            <div className="h-28 rounded-3xl border border-white/10 bg-white/[0.03]" />
            <div className="space-y-6">
              <div className="h-28 rounded-3xl border border-white/10 bg-white/[0.03]" />
              <div className="h-[46vh] rounded-3xl border border-white/10 bg-white/[0.03]" />
              <div className="h-[36vh] rounded-3xl border border-white/10 bg-white/[0.03]" />
            </div>
          </div>
        </main>
      }
    >
      <ParkingPatrolPageContent />
    </Suspense>
  );
}
