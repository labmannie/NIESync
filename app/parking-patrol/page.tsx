"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock3,
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
  reporterMarkResolvedAction,
  revealParkingPhoneAction,
  sendParkingMessageAction,
  submitParkingReportAction,
} from "./actions";

type ParkingStatus =
  | "pending"
  | "chatting"
  | "acknowledged"
  | "email_sent"
  | "resolved"
  | "unmatched"
  | "expired";

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
      existing.addEventListener("error", () => {
        reject(new Error("Unable to load OCR engine."));
      });
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

function isChatWindowOpen(report: ParkingReportRow | null, nowMs: number) {
  if (!report) return false;
  if (!["pending", "chatting"].includes(report.status)) return false;
  const createdMs = new Date(report.created_at).getTime();
  if (Number.isNaN(createdMs)) return false;
  return nowMs - createdMs < 2 * 60 * 1000;
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

export default function ParkingPatrolPage() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  const [userId, setUserId] = useState("");
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [reports, setReports] = useState<ParkingReportRow[]>([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [messages, setMessages] = useState<ParkingMessageRow[]>([]);
  const [schemaError, setSchemaError] = useState("");

  const [reportPanelOpen, setReportPanelOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [ocrRawText, setOcrRawText] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isRunningOcr, setIsRunningOcr] = useState(false);
  const [plateInput, setPlateInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [threadDraft, setThreadDraft] = useState("");
  const [threadActionError, setThreadActionError] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isCallingOwner, setIsCallingOwner] = useState(false);
  const [revealedPhoneByReport, setRevealedPhoneByReport] = useState<Record<string, string>>(
    {}
  );
  const [clockMs, setClockMs] = useState(() => Date.now());

  const reportIdFromQuery = searchParams.get("report") || "";

  const loadReports = useCallback(async () => {
    setIsLoadingReports(true);
    setSchemaError("");

    const { data, error } = await supabase
      .from("parking_reports")
      .select(
        "id, reported_by, license_plate, plate_normalized, location_description, matched_owner_id, status, phone_revealed, email_sent_at, resolved_at, created_at, photo_url, ocr_raw_text"
      )
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) {
      if (error.code === "42P01") {
        setSchemaError(
          "Parking schema not found. Run Supabase migrations before using this module."
        );
      } else {
        setSchemaError(error.message || "Unable to load reports.");
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
    let active = true;

    const bootstrap = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;
      setUserId(user?.id || "");
      await loadReports();
    };

    bootstrap();
    return () => {
      active = false;
    };
  }, [supabase, loadReports]);

  useEffect(() => {
    if (!selectedReportId) {
      setMessages([]);
      return;
    }
    loadMessages(selectedReportId);
  }, [selectedReportId, loadMessages]);

  useEffect(() => {
    if (!userId) return;

    const reportChannel = supabase
      .channel(`parking-report-stream-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parking_reports" },
        () => {
          loadReports();
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
      .channel(`parking-message-stream-${selectedReportId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parking_report_messages",
          filter: `report_id=eq.${selectedReportId}`,
        },
        () => {
          loadMessages(selectedReportId);
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
  const isUnmatchedReport = selectedReport?.status === "unmatched";
  const chatWindowOpen = isChatWindowOpen(selectedReport, clockMs);
  const isChatReadOnly = Boolean(
    !selectedReport ||
      isUnmatchedReport ||
      selectedReport.status === "resolved" ||
      !chatWindowOpen
  );

  const canOwnerAcknowledge = Boolean(
    selectedReport &&
      isOwner &&
      ["pending", "chatting", "email_sent"].includes(selectedReport.status)
  );
  const canReporterResolve = Boolean(
    selectedReport && isReporter && selectedReport.status === "acknowledged"
  );
  const canCallOwner = Boolean(
    selectedReport &&
      isReporter &&
      selectedReport.status === "email_sent" &&
      Date.now() - new Date(selectedReport.created_at).getTime() >= 5 * 60 * 1000
  );
  const ownerPhone = selectedReport ? revealedPhoneByReport[selectedReport.id] || "" : "";

  const runOcr = async (file: File) => {
    setIsRunningOcr(true);
    setOcrProgress(0);
    setSubmitError("");
    setSubmitMessage("");

    try {
      const recognizer = await loadTesseractRecognizer();
      const result = await recognizer.recognize(file, "eng", {
        logger: (message) => {
          const progressValue = Number(message.progress || 0);
          if (Number.isFinite(progressValue)) {
            setOcrProgress(Math.max(0, Math.min(100, Math.round(progressValue * 100))));
          }
        },
      });

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
      }

      if (!plateToApply) {
        setSubmitError("OCR ran successfully, but could not detect a clear plate. Please edit manually.");
      } else {
        setSubmitMessage("OCR completed. Review and edit the extracted plate if needed.");
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
    setThreadActionError("");

    if (!locationInput.trim()) {
      setSubmitError("Please provide a location description.");
      return;
    }

    const plateValidation = validateParkingReportPlate(plateInput);
    if (plateValidation.error) {
      setSubmitError(plateValidation.error);
      return;
    }

    setIsSubmitting(true);
    const payload = new FormData();
    if (photoFile) {
      payload.append("photo", photoFile);
    }
    payload.append("location_description", locationInput.trim());
    payload.append("plate_input", plateInput.trim());
    payload.append("ocr_raw_text", ocrRawText.trim());

    const result = await submitParkingReportAction(payload);
    setIsSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error || "Unable to submit report.");
      return;
    }

    setSubmitMessage(
      result.unmatched
        ? "This vehicle is not registered in NIE Campus Sync. Your report has been logged."
        : "Report submitted. Owner has been notified through in-app channel."
    );

    setPlateInput("");
    setLocationInput("");
    setOcrRawText("");
    setOcrProgress(0);
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoFile(null);
    setPhotoPreview("");
    setReportPanelOpen(false);

    await loadReports();
    if (result.reportId) {
      setSelectedReportId(result.reportId);
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
      `Location: ${selectedReport.location_description}`,
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
    <main className="min-h-screen w-full bg-campus-black px-4 pb-16 pt-36 text-white selection:bg-accent-amber/30 md:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-8 rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-7 shadow-[0_18px_70px_rgba(0,0,0,0.45)] md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">
                Parking <span className="text-accent-amber">Patrol</span>
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-text-secondary md:text-base">
                Report blocking vehicles, communicate quickly in a private incident thread, and resolve safely with
                guided escalation.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-text-secondary">
              <RadioTower className="h-4 w-4 text-accent-amber" />
              Live Incident Channel
            </div>
          </div>
        </header>

        {schemaError ? (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {schemaError}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-text-secondary">
                    Report Blocking Vehicle
                  </h2>
                  <p className="mt-2 text-sm text-text-secondary">
                    Add vehicle number directly, or upload a photo to auto-fill and edit before submission.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReportPanelOpen((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-xl border border-accent-amber/40 bg-accent-amber/20 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-accent-amber transition-colors hover:bg-accent-amber/30"
                >
                  <ShieldAlert className="h-4 w-4" />
                  {reportPanelOpen ? "Close Form" : "Report Blocking Vehicle"}
                </button>
              </div>

              {submitMessage ? (
                <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
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

              {reportPanelOpen ? (
                <div className="mt-5 space-y-5 rounded-2xl border border-white/10 bg-black/35 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-[0.16em] text-text-secondary">
                        Upload / Capture Photo (Optional)
                      </label>
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-4 text-xs font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-white/[0.06]">
                        <Camera className="h-4 w-4 text-accent-amber" />
                        Choose Incident Photo
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
                            className="h-48 w-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.01] text-xs text-text-secondary">
                          Photo preview will appear here.
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-[0.16em] text-text-secondary">
                        Plate Extraction
                      </label>
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                        <div className="mb-2 flex items-center justify-between text-[11px] text-text-secondary">
                          <span>OCR Status</span>
                          <span>{isRunningOcr ? `${ocrProgress}%` : "Idle"}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full bg-gradient-to-r from-accent-amber to-yellow-300 transition-all duration-300"
                            style={{ width: `${isRunningOcr ? ocrProgress : 0}%` }}
                          />
                        </div>
                        <p className="mt-2 text-[11px] text-text-secondary">
                          {isRunningOcr
                            ? "Scanning plate text from your uploaded image..."
                            : "You can edit the extracted plate before submitting."}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-[0.16em] text-text-secondary">
                          Extracted Plate (Editable)
                        </label>
                        <input
                          type="text"
                          value={plateInput}
                          onChange={(event) =>
                            setPlateInput(formatParkingReportPlateInput(event.target.value))
                          }
                          placeholder="KA-09-AB-1234"
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-mono tracking-widest text-white outline-none transition-colors placeholder:text-white/30 focus:border-accent-amber/60"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-[0.16em] text-text-secondary">
                      Location Description
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
                    <input
                      type="text"
                      value={locationInput}
                      onChange={(event) => setLocationInput(event.target.value)}
                      placeholder="Example: Blocked my car from moving out near Library Gate side lane."
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-accent-amber/60"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSubmitReport}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] transition-colors hover:bg-white/20 disabled:opacity-60"
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

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-text-secondary">
                  Scoped Incident Thread
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
                  <div className="mt-4 animate-pulse space-y-3">
                    <div className="h-16 rounded-xl bg-white/10" />
                    <div className="h-28 rounded-xl bg-white/10" />
                    <div className="h-12 rounded-xl bg-white/10" />
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-text-secondary">
                    Select a report from the list to view timeline and thread.
                  </p>
                )
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-lg font-bold tracking-wider">
                          {selectedReport.license_plate}
                        </p>
                        <p className="mt-1 text-xs text-text-secondary">
                          {selectedReport.location_description} • {formatElapsed(selectedReport.created_at)}
                        </p>
                      </div>
                      {(selectedReport.status === "pending" || selectedReport.status === "chatting") && (
                        <div className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-[11px] text-text-secondary">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatTwoMinuteCountdown(selectedReport.created_at, clockMs)}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {canOwnerAcknowledge ? (
                        <button
                          type="button"
                          onClick={handleOwnerAcknowledge}
                          disabled={isAcknowledging}
                          className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-100 transition-colors hover:bg-emerald-500/30 disabled:opacity-60"
                        >
                          {isAcknowledging ? "Updating..." : "I'm Moving ✅"}
                        </button>
                      ) : null}

                      {canReporterResolve ? (
                        <button
                          type="button"
                          onClick={handleReporterResolve}
                          disabled={isResolving}
                          className="rounded-lg border border-green-400/40 bg-green-500/20 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-green-100 transition-colors hover:bg-green-500/30 disabled:opacity-60"
                        >
                          {isResolving ? "Resolving..." : "Mark as Resolved"}
                        </button>
                      ) : null}

                      {canCallOwner ? (
                        <button
                          type="button"
                          onClick={handleRevealAndCall}
                          disabled={isCallingOwner}
                          className="rounded-lg border border-orange-400/40 bg-orange-500/20 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-orange-100 transition-colors hover:bg-orange-500/30 disabled:opacity-60"
                        >
                          {isCallingOwner ? "Revealing..." : "Call Owner"}
                        </button>
                      ) : null}

                      {ownerPhone ? (
                        <a
                          href={`tel:${ownerPhone}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white"
                        >
                          <PhoneCall className="h-3.5 w-3.5" />
                          {ownerPhone}
                        </a>
                      ) : null}
                    </div>
                  </div>

                  {isUnmatchedReport ? (
                    <div className="rounded-2xl border border-slate-400/30 bg-slate-500/10 px-4 py-4 text-sm text-slate-200">
                      This vehicle is not registered in NIE Campus Sync. Your report has been logged. No further
                      escalation is triggered for unmatched plates.
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      {!chatWindowOpen &&
                      (selectedReport.status === "pending" || selectedReport.status === "chatting") ? (
                        <div className="mb-3 rounded-lg border border-indigo-400/35 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
                          Chat window closed after 2 minutes. Escalation email stage is active.
                        </div>
                      ) : null}

                      <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
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

                      <div className="mt-4 flex gap-2">
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
                          disabled={
                            isChatReadOnly ||
                            !threadDraft.trim() ||
                            isSendingMessage
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] transition-colors hover:bg-white/20 disabled:opacity-60"
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
                            Download Transcript
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {threadActionError ? (
                <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {threadActionError}
                </p>
              ) : null}
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-text-secondary">
                  Reports
                </h2>
                {isLoadingReports ? <Loader2 className="h-4 w-4 animate-spin text-white/50" /> : null}
              </div>

              <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                {isLoadingReports ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={`report-skeleton-${index}`}
                      className="animate-pulse rounded-xl border border-white/10 bg-black/30 px-3 py-3"
                    >
                      <div className="h-4 w-2/5 rounded bg-white/10" />
                      <div className="mt-2 h-3 w-4/5 rounded bg-white/10" />
                      <div className="mt-3 h-2 w-1/4 rounded bg-white/10" />
                    </div>
                  ))
                ) : reports.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-xs text-text-secondary">
                    No reports visible yet.
                  </p>
                ) : (
                  reports.map((report) => {
                    const active = report.id === selectedReportId;
                    return (
                      <button
                        key={report.id}
                        type="button"
                        onClick={() => setSelectedReportId(report.id)}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                          active
                            ? "border-accent-blue/45 bg-accent-blue/15"
                            : "border-white/10 bg-black/30 hover:border-white/25"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-mono text-sm font-semibold tracking-wider text-white">
                            {report.license_plate}
                          </p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${STATUS_THEME[report.status]}`}
                          >
                            {report.status.replace("_", " ")}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-xs text-text-secondary">
                          {report.location_description}
                        </p>
                        <p className="mt-2 text-[10px] text-white/40">{formatElapsed(report.created_at)}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

          </aside>
        </div>
      </div>
    </main>
  );
}
