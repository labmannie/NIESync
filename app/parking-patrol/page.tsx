"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Camera,
  Download,
  Loader2,
  PhoneCall,
  Send,
  ShieldAlert,
  UploadCloud,
  X,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import {
  formatParkingReportPlateInput,
  normalizeParkingReportPlateForSubmission,
  validateParkingReportPlate,
} from "@/lib/vehiclePlate";
import {
  getParkingIncidentPhotoUrlAction,
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

const LOCATION_OPTIONS = [...COMMON_LOCATION_ZONES, "Other"];
const CHAT_WINDOW_SECONDS = 60;
const EMAIL_TO_CALL_SECONDS = 60;

const STATUS_THEME: Record<ParkingStatus, string> = {
  pending: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  chatting: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  acknowledged: "bg-green-500/10 text-green-400 border border-green-500/20",
  email_sent: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  resolved: "bg-green-500/10 text-green-400 border border-green-500/20",
  unmatched: "bg-red-500/10 text-red-400 border border-red-500/20",
  expired: "bg-red-500/10 text-red-400 border border-red-500/20",
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

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX = 1200;
      let w = img.width;
      let h = img.height;
      if (w > MAX) {
        h = Math.round((h * MAX) / w);
        w = MAX;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.75);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
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

function getElapsedSeconds(createdAt: string, nowMs: number) {
  const startedMs = new Date(createdAt).getTime();
  if (!Number.isFinite(startedMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startedMs) / 1000));
}

function parseOptionalDateMs(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return 0;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCountdown(seconds: number) {
  if (seconds <= 0) return "—";
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function getStageCountdown(report: ParkingReportRow | null, nowMs: number) {
  if (!report) {
    return { display: "—", label: "LIVE TIMER", progress: 0, ringColor: "#888888" };
  }

  const chatElapsed = getElapsedSeconds(report.created_at, nowMs);
  const emailSentAtMs = parseOptionalDateMs(report.email_sent_at);

  if (chatElapsed < CHAT_WINDOW_SECONDS) {
    const remaining = Math.max(0, CHAT_WINDOW_SECONDS - chatElapsed);
    return {
      display: formatCountdown(remaining),
      label: "CHAT WINDOW",
      progress: Math.min(1, chatElapsed / CHAT_WINDOW_SECONDS),
      ringColor: "#22c55e",
    };
  }

  if (!emailSentAtMs) {
    return {
      display: "—",
      label: "EMAIL DISPATCH",
      progress: 0.1,
      ringColor: "#f59e0b",
    };
  }

  const emailElapsed = Math.max(0, Math.floor((nowMs - emailSentAtMs) / 1000));

  if (!report.phone_revealed && emailElapsed < EMAIL_TO_CALL_SECONDS) {
    const elapsedInStage = Math.max(0, emailElapsed);
    const remaining = Math.max(0, EMAIL_TO_CALL_SECONDS - elapsedInStage);
    return {
      display: formatCountdown(remaining),
      label: "PHONE REVEAL",
      progress: Math.min(1, elapsedInStage / EMAIL_TO_CALL_SECONDS),
      ringColor: "#f5a623",
    };
  }

  return {
    display: "—",
    label: "CALL READY",
    progress: 1,
    ringColor: "#ef4444",
  };
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

function getThreadRoleLabel(message: ParkingMessageRow) {
  if (message.sender_role === "system") return "SYSTEM";
  if (message.sender_role === "reporter") return "YOU";
  return "VEHICLE OWNER";
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
  const [selectedLocationChip, setSelectedLocationChip] = useState("Other");
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
  const [reportPhotoUrlById, setReportPhotoUrlById] = useState<Record<string, string>>({});
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const messageListRef = useRef<HTMLDivElement | null>(null);

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
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;

    void syncServerClock();
    const timer = window.setInterval(() => {
      void syncServerClock();
    }, 60000);

    return () => window.clearInterval(timer);
  }, [isLoggedIn, syncServerClock]);

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
        {
          event: "*",
          schema: "public",
          table: "parking_reports",
          filter: `reported_by=eq.${userId}`,
        },
        () => {
          void loadReports(false);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parking_reports",
          filter: `matched_owner_id=eq.${userId}`,
        },
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
  const synchronizedNowMs = clockMs + serverClockOffsetMs;
  const isReporter = selectedReport?.reported_by === userId;
  const chatWindowOpen = isChatWindowOpen(selectedReport, synchronizedNowMs);
  const isChatReadOnly = Boolean(
    !selectedReport ||
      selectedReport.status === "unmatched" ||
      selectedReport.status === "resolved" ||
      !chatWindowOpen
  );

  const canOwnerAcknowledge = canOwnerAcknowledgeReport(selectedReport, userId);
  const canReporterResolve = canReporterResolveReport(selectedReport, userId);
  const canMarkUnresolved = canReporterMarkUnresolved(selectedReport, userId, synchronizedNowMs);
  const canCallOwner = canReporterRevealOwnerPhone(selectedReport, userId, synchronizedNowMs);
  const ownerPhone = selectedReport ? revealedPhoneByReport[selectedReport.id] || "" : "";
  const selectedReportPhotoUrl = selectedReport ? reportPhotoUrlById[selectedReport.id] || "" : "";
  const unresolvedCountdown = selectedReport?.acknowledged_at
    ? formatFiveMinuteCountdown(selectedReport.acknowledged_at, synchronizedNowMs)
    : "5:00";
  const chatElapsedSeconds = selectedReport
    ? getElapsedSeconds(selectedReport.created_at, synchronizedNowMs)
    : 0;
  const hasEmailSentAt = Boolean(String(selectedReport?.email_sent_at || "").trim());
  const emailElapsedSeconds =
    selectedReport && hasEmailSentAt
      ? getElapsedSeconds(String(selectedReport.email_sent_at || ""), synchronizedNowMs)
      : 0;
  const callReady =
    Boolean(selectedReport) &&
    hasEmailSentAt &&
    (Boolean(selectedReport?.phone_revealed) || emailElapsedSeconds >= EMAIL_TO_CALL_SECONDS);
  const stageCountdown = getStageCountdown(selectedReport, synchronizedNowMs);
  const stageLineFillPercent = !selectedReport ? 0 : callReady ? 100 : chatElapsedSeconds >= CHAT_WINDOW_SECONDS ? 50 : 0;
  const circleRadius = 52;
  const circleLength = 2 * Math.PI * circleRadius;
  const circleOffset = circleLength * (1 - stageCountdown.progress);

  useEffect(() => {
    if (!messageListRef.current) return;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [messages, selectedReport?.id]);

  useEffect(() => {
    if (!selectedReport?.id || !selectedReport.photo_url) return;
    if (reportPhotoUrlById[selectedReport.id]) return;

    let cancelled = false;

    const loadSignedPhoto = async () => {
      const result = await getParkingIncidentPhotoUrlAction(selectedReport.photo_url || "");
      if (cancelled || !result.ok || !result.url) return;
      setReportPhotoUrlById((prev) => ({ ...prev, [selectedReport.id]: result.url! }));
    };

    void loadSignedPhoto();

    return () => {
      cancelled = true;
    };
  }, [selectedReport?.id, selectedReport?.photo_url, reportPhotoUrlById]);

  const runOcr = async (image: Blob) => {
    setIsRunningOcr(true);
    setSubmitError("");
    setSubmitMessage("");

    try {
      const recognizer = await loadTesseractRecognizer();
      const result = await recognizer.recognize(image, "eng");

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

    setSubmitError("");
    setSubmitMessage("");

    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }

    try {
      const compressedBlob = await compressImage(file);
      const compressedFile = new File(
        [compressedBlob],
        `${String(file.name || "incident-photo").replace(/\.[^.]+$/, "") || "incident-photo"}.jpg`,
        { type: "image/jpeg" }
      );

      const previewUrl = URL.createObjectURL(compressedFile);
      setPhotoFile(compressedFile);
      setPhotoPreview(previewUrl);
      await runOcr(compressedFile);
    } catch {
      setSubmitError("Unable to process this photo. Please try a different image.");
    }
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
    setSelectedLocationChip("Other");
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

  const handleDownloadUnmatchedPdf = () => {
    if (!unmatchedReport || typeof window === "undefined") return;

    const printable = buildUnmatchedCopyText(unmatchedReport)
      .split("\n")
      .map((line) => `<p style="margin:0 0 10px 0;">${line}</p>`)
      .join("");

    const popup = window.open("", "_blank", "width=900,height=900");
    if (!popup) {
      setCopyDetailsMessage("Popup blocked. Allow popups to save as PDF.");
      return;
    }

    popup.document.write(`
      <html>
        <head>
          <title>Parking Incident Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { font-size: 20px; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <h1>NIE Sync - Unregistered Vehicle Report</h1>
          ${printable}
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
    setCopyDetailsMessage("Print dialog opened. Choose Save as PDF.");
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
      const label = getThreadRoleLabel(message);
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
    <main className="min-h-screen w-full bg-[#0a0a0a] px-4 py-6 pb-20 pt-32 text-white">
      <div className="mx-auto w-full max-w-[640px] space-y-3">
        <header
          className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 backdrop-blur-md"
          style={{
            clipPath: "polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 100%)",
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888]">Parking Patrol</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Live Incident Desk</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#aaa]">
            Report, chat, escalate, and resolve parking incidents in one mobile-first flow.
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-bold text-green-400">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
              Live
            </span>
            <Link
              href="/profile/reports"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/10 px-4 text-xs font-bold text-[#aaa]"
            >
              History Archive
            </Link>
          </div>
        </header>

        {schemaError ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {schemaError}
          </div>
        ) : null}

        <section className="space-y-3">
          <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888]">Live Incident</p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-[#888]">
                {isLoadingReports ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {reports.length}
              </span>
            </div>
            {selectedReport ? (
              <div className="mt-3 rounded-xl border border-white/[0.06] bg-[#161616] px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-2xl font-black tracking-widest text-[#f5a623]">
                    {selectedReport.license_plate}
                  </p>
                  <span className="text-xs text-[#555]">{formatElapsed(selectedReport.created_at)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[#aaa]">
                  {selectedReport.location_description}
                </p>
              </div>
            ) : (
              <p className="mt-3 rounded-2xl border border-dashed border-white/10 p-4 text-sm text-[#888]">
                No live report is active for your account right now.
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888]">Report Vehicle</p>
                <p className="mt-1 text-sm text-[#aaa]">Upload, auto-detect plate, and submit in one flow.</p>
              </div>
              <button
                type="button"
                onClick={() => setReportPanelOpen((current) => !current)}
                className="inline-flex h-12 min-w-[140px] items-center justify-center gap-2 rounded-xl bg-[#f5a623] px-4 text-sm font-bold text-black transition-transform active:scale-95"
              >
                <ShieldAlert className="h-4 w-4" />
                {reportPanelOpen ? "Hide Form" : "Open Form"}
              </button>
            </div>

            {submitMessage ? (
              <p className="mt-3 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm whitespace-pre-line text-green-300">
                {submitMessage}
              </p>
            ) : null}
            {submitError ? (
              <p className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                <AlertCircle className="h-4 w-4" />
                {submitError}
              </p>
            ) : null}
            {unmatchedReport ? (
              <div className="mt-3 rounded-2xl border-2 border-dashed border-amber-500/30 bg-amber-500/5 p-4 text-center">
                <p className="text-3xl">⚠️</p>
                <p className="mt-2 text-sm font-bold text-white">Vehicle not registered in NIE Sync.</p>
                <p className="mt-1 text-xs text-[#888]">Share or download details for manual follow-up.</p>
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={handleCopyUnmatchedDetails}
                    className="h-12 w-full rounded-xl border border-white/10 bg-transparent text-sm font-bold text-[#aaa]"
                  >
                    Copy Details
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadUnmatchedPdf}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent text-sm font-bold text-[#aaa]"
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </button>
                  {copyDetailsMessage ? <p className="text-xs text-[#888]">{copyDetailsMessage}</p> : null}
                </div>
              </div>
            ) : null}

            {reportPanelOpen ? (
              <div className="mt-4 space-y-3 rounded-2xl border border-white/[0.06] bg-[#161616] p-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888]">Vehicle Plate</p>
                  <input
                    type="text"
                    value={plateInput}
                    onChange={(event) => setPlateInput(formatParkingReportPlateInput(event.target.value))}
                    placeholder="KA-09-AB-1234"
                    className="mt-2 w-full rounded-xl border border-white/[0.06] bg-[#111] p-4 text-center font-mono text-2xl font-black tracking-widest text-[#f5a623] outline-none focus:border-[#f5a623]/40"
                  />
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888]">Photo Upload</p>
                  <label className="relative mt-2 flex min-h-[160px] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.02] p-6 transition-colors active:border-[#f5a623]/40">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        void handlePhotoChange(file);
                      }}
                    />
                    {photoPreview ? (
                      <div className="relative w-full overflow-hidden rounded-xl border border-white/[0.06]">
                        <img src={photoPreview} alt="Incident preview" className="h-48 w-full object-cover" />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (photoPreview) URL.revokeObjectURL(photoPreview);
                            setPhotoFile(null);
                            setPhotoPreview("");
                            setOcrRawText("");
                          }}
                          className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"
                          aria-label="Remove photo"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Camera className="h-8 w-8 text-[#555]" />
                        <p className="text-sm text-[#888]">{isRunningOcr ? "Extracting plate..." : "Tap to capture or upload"}</p>
                        <p className="text-xs text-[#555]">Photo will be compressed automatically</p>
                      </>
                    )}
                  </label>
                </div>

                {photoFile ? (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888]">Detected Plate</p>
                    {isRunningOcr ? (
                      <div className="mt-2 h-14 animate-pulse rounded-xl bg-white/[0.04]" />
                    ) : (
                      <input
                        type="text"
                        value={plateInput}
                        onChange={(event) => setPlateInput(formatParkingReportPlateInput(event.target.value))}
                        className="mt-2 w-full rounded-xl border border-[#f5a623]/20 bg-[#111] p-4 text-center font-mono text-xl font-black tracking-widest text-[#f5a623] outline-none"
                      />
                    )}
                    <p className="mt-2 text-center text-xs text-[#555]">OCR auto-filled · Edit if incorrect</p>
                  </div>
                ) : null}

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888]">Location</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {LOCATION_OPTIONS.map((zone) => {
                      const selected = selectedLocationChip === zone;
                      return (
                        <button
                          key={zone}
                          type="button"
                          onClick={() => {
                            setSelectedLocationChip(zone);
                            if (zone !== "Other") {
                              setLocationInput(zone);
                            } else if (COMMON_LOCATION_ZONES.includes(locationInput)) {
                              setLocationInput("");
                            }
                          }}
                          className={`rounded-xl px-4 py-2 text-xs font-semibold transition-transform active:scale-95 ${
                            selected
                              ? "border border-[#f5a623]/30 bg-[#f5a623]/10 text-[#f5a623]"
                              : "border border-white/[0.06] bg-white/[0.04] text-[#888]"
                          }`}
                        >
                          {zone}
                        </button>
                      );
                    })}
                  </div>
                  {selectedLocationChip === "Other" ? (
                    <textarea
                      value={locationInput}
                      onChange={(event) => setLocationInput(event.target.value)}
                      placeholder="Describe exact location"
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-white/[0.06] bg-[#111] p-3 text-sm text-white outline-none placeholder:text-[#444] focus:border-[#f5a623]/40"
                    />
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={handleSubmitReport}
                  disabled={isSubmitting || !isLoggedIn}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f5a623] text-sm font-bold text-black transition-transform active:scale-95 disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  {isSubmitting ? "Submitting..." : "Submit Incident Report"}
                </button>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888]">Live Incident Thread</h2>
                {selectedReport ? (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${STATUS_THEME[selectedReport.status]}`}
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
                  <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-[#888]">
                    No live report is active for your account right now.
                  </p>
                )
              ) : (
                <div className="space-y-4">
                  <div
                    className="rounded-2xl border border-white/[0.06] bg-[#161616] p-4"
                    style={{
                      clipPath:
                        "polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 100%)",
                    }}
                  >
                    <div className="px-1 pb-4 sm:px-4">
                      <div className="relative flex items-start justify-between">
                        <div className="absolute left-0 right-0 top-3 h-[1px] bg-white/10" />
                        <div
                          className="absolute left-0 top-3 h-[1px] bg-gradient-to-r from-green-400 via-[#f5a623] to-[#ef4444] transition-all"
                          style={{ width: `${stageLineFillPercent}%` }}
                        />
                        {["Chat", "Email", "Call"].map((label, index) => {
                          const node = index + 1;
                          const completed =
                            node === 1 ? chatElapsedSeconds >= CHAT_WINDOW_SECONDS : node === 2 ? callReady : false;
                          const active =
                            node === 1
                              ? chatElapsedSeconds < CHAT_WINDOW_SECONDS
                              : node === 2
                                ? chatElapsedSeconds >= CHAT_WINDOW_SECONDS && !callReady
                                : callReady;
                          const nodeClass = completed
                            ? "bg-green-500 border-green-400"
                            : active
                              ? "bg-[#f5a623] border-[#f5a623]"
                              : "bg-transparent border-[#555]";
                          const textClass = completed
                            ? "text-green-400"
                            : active
                              ? "text-[#f5a623]"
                              : "text-[#555]";
                          return (
                            <div key={label} className="relative z-10 flex flex-col items-center gap-1.5">
                              <span className={`h-6 w-6 rounded-full border-2 ${nodeClass}`} />
                              <span className={`text-[9px] font-bold uppercase tracking-[0.12em] sm:text-[10px] ${textClass}`}>
                                {label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-col items-center justify-center">
                      <div className="relative h-28 w-28 sm:h-36 sm:w-36">
                        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
                          <circle cx="60" cy="60" r={circleRadius} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
                          <circle
                            cx="60"
                            cy="60"
                            r={circleRadius}
                            stroke={stageCountdown.ringColor}
                            strokeWidth="6"
                            fill="none"
                            strokeDasharray={circleLength}
                            strokeDashoffset={circleOffset}
                            strokeLinecap="round"
                            className="transition-all duration-1000 ease-linear"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="font-mono text-3xl font-black text-white sm:text-4xl">{stageCountdown.display}</span>
                        </div>
                      </div>
                      <span className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[#888]">
                        {stageCountdown.label}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-2xl font-black tracking-widest text-[#f5a623]">
                          {selectedReport.license_plate}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-[#aaa]">{selectedReport.location_description}</p>
                        <p className="mt-1 text-xs text-[#555]">{formatElapsed(selectedReport.created_at)}</p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${STATUS_THEME[selectedReport.status]}`}
                      >
                        {selectedReport.status.replace("_", " ")}
                      </span>
                    </div>

                    {selectedReportPhotoUrl ? (
                      <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.06] bg-[#111]">
                        <img
                          src={selectedReportPhotoUrl}
                          alt={`Incident photo for ${selectedReport.license_plate}`}
                          className="h-44 w-full object-cover"
                        />
                      </div>
                    ) : null}

                    <div className="mt-4 space-y-2">
                    {canOwnerAcknowledge ? (
                      <button
                        type="button"
                        onClick={handleOwnerAcknowledge}
                        disabled={isAcknowledging}
                        className="h-12 w-full rounded-xl bg-[#f5a623] text-sm font-bold text-black transition-transform active:scale-95 disabled:opacity-60"
                      >
                        {isAcknowledging ? "Updating..." : "I'm Moving"}
                      </button>
                    ) : null}

                    {canReporterResolve ? (
                      <button
                        type="button"
                        onClick={handleReporterResolve}
                        disabled={isResolving}
                        className="h-12 w-full rounded-xl bg-[#22c55e] text-sm font-bold text-black disabled:opacity-60"
                      >
                        {isResolving ? "Resolving..." : "Mark Resolved"}
                      </button>
                    ) : null}

                    {isReporter && selectedReport.status === "acknowledged" ? (
                      canMarkUnresolved ? (
                        <button
                          type="button"
                          onClick={handleReporterMarkUnresolved}
                          disabled={isMarkingUnresolved}
                          className="h-12 w-full rounded-xl border border-white/10 bg-transparent text-sm font-bold text-[#aaa] transition-transform active:scale-95 disabled:opacity-60"
                        >
                          {isMarkingUnresolved ? "Updating..." : "Still Blocked (Unresolved)"}
                        </button>
                      ) : (
                        <div className="h-12 w-full rounded-xl border border-white/10 px-4 text-center text-xs font-bold leading-[48px] tracking-[0.06em] text-[#888]">
                          Unresolved opens in {unresolvedCountdown}
                        </div>
                      )
                    ) : null}

                    {canCallOwner ? (
                      <button
                        type="button"
                        onClick={handleRevealAndCall}
                        disabled={isCallingOwner}
                        className="h-12 w-full rounded-xl bg-[#ef4444] text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-60"
                      >
                        {isCallingOwner ? "Revealing..." : "Call Owner"}
                      </button>
                    ) : null}

                    {ownerPhone ? (
                      <a
                        href={`tel:${ownerPhone}`}
                        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent text-sm font-bold text-[#aaa]"
                      >
                        <PhoneCall className="h-4 w-4" />
                        {ownerPhone}
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111]">
                  {!chatWindowOpen &&
                  (selectedReport.status === "pending" ||
                    selectedReport.status === "chatting") ? (
                    <div className="border-b border-white/[0.06] bg-blue-500/10 px-4 py-2 text-xs text-blue-300">
                      Chat window closed after 1 minute. Escalation email is being dispatched.
                    </div>
                  ) : null}

                  <div
                    ref={messageListRef}
                    className="max-h-64 space-y-3 overflow-y-auto overscroll-contain p-4 scroll-smooth"
                  >
                    {messages.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-[#555]">
                        No messages in this thread yet.
                      </p>
                    ) : (
                      messages.map((message) => {
                        if (message.sender_role === "system") {
                          return (
                            <p key={message.id} className="py-1 text-center text-xs italic text-[#555]">
                              {message.message}
                            </p>
                          );
                        }

                        const isReporterMessage = message.sender_role === "reporter";
                        return (
                          <div key={message.id} className={isReporterMessage ? "flex justify-end" : "flex justify-start"}>
                            <div className="max-w-[80%]">
                              <p className={`mb-1 text-[10px] text-[#555] ${isReporterMessage ? "text-right" : ""}`}>
                                {getThreadRoleLabel(message)}
                              </p>
                              <div
                                className={`rounded-2xl px-4 py-2.5 text-sm ${
                                  isReporterMessage
                                    ? "rounded-tr-sm border border-[#f5a623]/20 bg-[#f5a623]/15 text-[#f5a623]"
                                    : "rounded-tl-sm border border-white/[0.06] bg-white/[0.04] text-[#ccc]"
                                }`}
                              >
                                {message.message}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="sticky bottom-0 border-t border-white/[0.06] bg-[#0a0a0a] p-3">
                    <div className="flex gap-2">
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
                      placeholder="Type a message..."
                      disabled={isChatReadOnly || isSendingMessage}
                      className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-[#444] focus:border-[#f5a623]/40 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={handleSendThreadMessage}
                      disabled={isChatReadOnly || !threadDraft.trim() || isSendingMessage}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[#f5a623]/20 bg-[#f5a623]/10 text-[#f5a623] transition-transform active:scale-95 disabled:opacity-60"
                    >
                      {isSendingMessage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </button>
                    </div>

                    {!chatWindowOpen || selectedReport.status === "resolved" ? (
                      <button
                        type="button"
                        onClick={handleDownloadTranscript}
                        disabled={messages.length === 0}
                        className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent text-sm font-bold text-[#aaa] disabled:opacity-60"
                      >
                        <Download className="h-4 w-4" />
                        Download Transcript
                      </button>
                    ) : null}
                  </div>
                </div>

                {threadActionError ? (
                  <p className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    <AlertCircle className="h-4 w-4" />
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
        <main className="min-h-screen w-full bg-[#0a0a0a] px-4 py-6 pb-20 pt-32 text-white">
          <div className="mx-auto w-full max-w-[640px] animate-pulse space-y-3">
            <div className="h-40 rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
            <div className="h-96 rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
            <div className="h-80 rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
          </div>
        </main>
      }
    >
      <ParkingPatrolPageContent />
    </Suspense>
  );
}
