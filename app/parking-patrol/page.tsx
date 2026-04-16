
"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  MapPin,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import {
  formatParkingReportPlateInput,
  getOwnerVehiclePlateFormatsHint,
  normalizeParkingReportPlateForSubmission,
  validateParkingReportPlate,
} from "@/lib/vehiclePlate";
import { resolveClientUser } from "@/utils/supabase/authClient";
import { MobileToast } from "@/components/MobileToast";
import {
  downloadParkingIncidentReportPdf,
  downloadParkingTranscriptPdf,
} from "@/lib/parkingReportPdf";
import {
  detectParkingPlateFromPhotoAction,
  getParkingIncidentPhotoUrlAction,
  ownerImMovingAction,
  reporterCancelReportAction,
  reporterMarkUnresolvedAction,
  reporterMarkResolvedAction,
  revealParkingPhoneAction,
  sendParkingMessageAction,
  submitParkingReportAction,
  triggerParkingEscalationAction,
} from "@/app/parking-patrol/actions";
import {
  canReporterCancelReport,
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

type ProfileIdentityRow = {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

type UnmatchedReportSnapshot = {
  reportId: string;
  plate: string;
  location: string;
  reportedAtIso: string;
  incidentPhotoUrl: string;
};

type LiveChannelStatus = "idle" | "connecting" | "live" | "error";

type StageMeta = {
  display: string;
  label: string;
  caption: string;
  progress: number;
  ringColor: string;
  railProgress: number;
  activeStep: 0 | 1 | 2;
};

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
const LOCATION_DESCRIPTION_MAX_LENGTH = 180;
const AUTH_RETRY_DELAY_MS = 900;
const MAX_AUTH_RETRY_ATTEMPTS = 4;
const TRANSIENT_AUTH_ERROR_REGEX = /timed out|abort|network|fetch/i;
const CHAT_SCROLL_BOTTOM_THRESHOLD = 120;

const STATUS_THEME: Record<ParkingStatus, string> = {
  pending: "border border-amber-400/25 bg-amber-400/10 text-amber-200",
  chatting: "border border-amber-400/25 bg-amber-400/10 text-amber-200",
  acknowledged: "border border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  email_sent: "border border-sky-400/25 bg-sky-400/10 text-sky-200",
  resolved: "border border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  unmatched: "border border-red-400/25 bg-red-400/10 text-red-200",
  expired: "border border-white/10 bg-white/5 text-white/70",
};

const STAGE_STEP_LABELS = ["Live chat", "Escalation", "Call handoff"] as const;

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function isTransientParkingAuthError(message: string) {
  return TRANSIENT_AUTH_ERROR_REGEX.test(String(message || ""));
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

function formatAgeFromMs(value: number) {
  if (!value) return "just now";
  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
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
  if (seconds <= 0) return "0:00";
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
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
  const shortId = String(report.reportId || "").slice(0, 8).toUpperCase() || "UNKNOWN";
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

function formatThreadParticipantTag(participant: ProfileIdentityRow) {
  const username = String(participant.username || "").trim();
  if (username) return `@${username}`;
  const firstName = String(participant.first_name || "").trim();
  const lastName = String(participant.last_name || "").trim();
  return `${firstName} ${lastName}`.trim();
}

function formatParkingStatus(status: ParkingStatus) {
  const labels: Record<ParkingStatus, string> = {
    pending: "Live chat",
    chatting: "Live chat",
    acknowledged: "Owner moving",
    email_sent: "Escalated",
    resolved: "Resolved",
    unmatched: "Unmatched",
    expired: "Expired",
  };
  return labels[status] || status.replace(/_/g, " ");
}

function mapChannelStatus(status: string): LiveChannelStatus {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "SUBSCRIBED") return "live";
  if (normalized === "TIMED_OUT" || normalized === "CHANNEL_ERROR") return "error";
  if (normalized === "CLOSED") return "idle";
  return "connecting";
}

function getSyncTone(status: LiveChannelStatus) {
  if (status === "live") return "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (status === "error") return "border border-red-400/20 bg-red-400/10 text-red-200";
  return "border border-white/10 bg-white/5 text-white/75";
}

function getStageMeta(report: ParkingReportRow | null, nowMs: number): StageMeta {
  if (!report) {
    return {
      display: "—",
      label: "Awaiting report",
      caption: "Select or create an incident to start the live flow.",
      progress: 0,
      ringColor: "#71717a",
      railProgress: 0,
      activeStep: 0,
    };
  }

  if (report.status === "resolved") {
    return {
      display: "DONE",
      label: "Incident resolved",
      caption: "This report is closed and will move to history.",
      progress: 1,
      ringColor: "#22c55e",
      railProgress: 100,
      activeStep: 2,
    };
  }

  if (report.status === "acknowledged") {
    return {
      display: "MOVED",
      label: "Owner acknowledged",
      caption: "Reporter can resolve when the obstruction clears.",
      progress: 1,
      ringColor: "#22c55e",
      railProgress: 100,
      activeStep: 2,
    };
  }

  const chatElapsed = getElapsedSeconds(report.created_at, nowMs);
  const emailSentAtMs = parseOptionalDateMs(report.email_sent_at);

  if (chatElapsed < CHAT_WINDOW_SECONDS) {
    const remaining = Math.max(0, CHAT_WINDOW_SECONDS - chatElapsed);
    const progress = Math.min(1, chatElapsed / CHAT_WINDOW_SECONDS);
    return {
      display: formatCountdown(remaining),
      label: "Live chat window",
      caption: "Owner can respond in real time before escalation starts.",
      progress,
      ringColor: "#22c55e",
      railProgress: progress * 34,
      activeStep: 0,
    };
  }

  if (!emailSentAtMs) {
    return {
      display: "SYNC",
      label: "Escalating",
      caption: "Dispatching escalation email and syncing the next handoff stage.",
      progress: 0.22,
      ringColor: "#f5a623",
      railProgress: 38,
      activeStep: 1,
    };
  }

  const emailElapsed = Math.max(0, Math.floor((nowMs - emailSentAtMs) / 1000));
  if (!report.phone_revealed && emailElapsed < EMAIL_TO_CALL_SECONDS) {
    const remaining = Math.max(0, EMAIL_TO_CALL_SECONDS - emailElapsed);
    const progress = Math.min(1, emailElapsed / EMAIL_TO_CALL_SECONDS);
    return {
      display: formatCountdown(remaining),
      label: "Phone reveal unlock",
      caption: "Email grace period is active before call handoff unlocks.",
      progress,
      ringColor: "#f5a623",
      railProgress: 34 + progress * 33,
      activeStep: 1,
    };
  }

  return {
    display: "CALL",
    label: "Call handoff ready",
    caption: "Reporter can reveal the phone number and call the owner now.",
    progress: 1,
    ringColor: "#ef4444",
    railProgress: 100,
    activeStep: 2,
  };
}

function getThreadRoleLabel(
  message: ParkingMessageRow,
  selectedReport: ParkingReportRow | null,
  viewerUserId: string,
  participantTagById: Record<string, string>
) {
  if (message.sender_role === "system") return "SYSTEM";
  if (!selectedReport) {
    return message.sender_role === "owner" ? "VEHICLE OWNER" : "REPORTER";
  }

  const viewerIsReporter = selectedReport.reported_by === viewerUserId;
  const viewerIsOwner = selectedReport.matched_owner_id === viewerUserId;

  if (message.sender_role === "reporter") {
    if (viewerIsReporter) return "YOU";
    const reporterId = String(selectedReport.reported_by || "");
    const participantTag = participantTagById[reporterId] || "";
    return participantTag ? `REPORTER (${participantTag})` : "REPORTER";
  }

  if (viewerIsOwner) return "YOU";
  const ownerId = String(selectedReport.matched_owner_id || "");
  const participantTag = participantTagById[ownerId] || "";
  return participantTag ? `OWNER (${participantTag})` : "VEHICLE OWNER";
}

function getThreadLockReason(report: ParkingReportRow | null, chatWindowOpen: boolean) {
  if (!report) return "No live incident is selected yet.";
  if (report.status === "resolved") return "This report is resolved. Download the transcript from history anytime.";
  if (report.status === "unmatched") return "Chat is unavailable for unmatched reports.";
  if (!chatWindowOpen && report.status !== "acknowledged") {
    return "The live chat window has closed. Continue through escalation or call handoff.";
  }
  return "";
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
  const [mobileToast, setMobileToast] = useState<{
    kind: "error" | "success" | "info";
    message: string;
  } | null>(null);
  const [unmatchedReport, setUnmatchedReport] = useState<UnmatchedReportSnapshot | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const [pendingOcrFile, setPendingOcrFile] = useState<File | null>(null);
  const [threadDraft, setThreadDraft] = useState("");
  const [threadActionError, setThreadActionError] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isDownloadingTranscript, setIsDownloadingTranscript] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelTargetReportId, setCancelTargetReportId] = useState("");
  const [isMarkingUnresolved, setIsMarkingUnresolved] = useState(false);
  const [isCallingOwner, setIsCallingOwner] = useState(false);
  const [revealedPhoneByReport, setRevealedPhoneByReport] = useState<Record<string, string>>({});
  const [reportPhotoUrlById, setReportPhotoUrlById] = useState<Record<string, string>>({});
  const [participantTagById, setParticipantTagById] = useState<Record<string, string>>({});
  const [participantAvatarById, setParticipantAvatarById] = useState<Record<string, string>>({});
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [lastServerSyncAt, setLastServerSyncAt] = useState(0);
  const [reportChannelStatus, setReportChannelStatus] = useState<LiveChannelStatus>("idle");
  const [messageChannelStatus, setMessageChannelStatus] = useState<LiveChannelStatus>("idle");
  const [lastReportRefreshAt, setLastReportRefreshAt] = useState(0);
  const [lastMessageRefreshAt, setLastMessageRefreshAt] = useState(0);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const escalationSyncInFlightRef = useRef(false);
  const escalatedReportsRef = useRef<Set<string>>(new Set());
  const reportLoadRequestRef = useRef(0);
  const messageLoadRequestRef = useRef(0);
  const reportsReloadTimerRef = useRef<number | null>(null);
  const messagesReloadTimerRef = useRef<number | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const lastRenderedReportIdRef = useRef("");

  const reportIdFromQuery = searchParams.get("report") || "";

  const clearReportsReloadTimer = useCallback(() => {
    if (reportsReloadTimerRef.current) {
      window.clearTimeout(reportsReloadTimerRef.current);
      reportsReloadTimerRef.current = null;
    }
  }, []);

  const clearMessagesReloadTimer = useCallback(() => {
    if (messagesReloadTimerRef.current) {
      window.clearTimeout(messagesReloadTimerRef.current);
      messagesReloadTimerRef.current = null;
    }
  }, []);

  const loadReports = useCallback(
    async (viewerId: string, showLoader = false) => {
      const requestId = ++reportLoadRequestRef.current;

      if (!viewerId) {
        setReports([]);
        setSelectedReportId("");
        if (showLoader) setIsLoadingReports(false);
        return;
      }

      if (showLoader) {
        setIsLoadingReports(true);
      }

      const { data, error } = await supabase
        .from("parking_reports")
        .select(
          "id, reported_by, license_plate, plate_normalized, location_description, matched_owner_id, status, phone_revealed, email_sent_at, acknowledged_at, resolved_at, created_at, photo_url, ocr_raw_text"
        )
        .or(`reported_by.eq.${viewerId},matched_owner_id.eq.${viewerId}`)
        .in("status", ["pending", "chatting", "acknowledged", "email_sent"])
        .order("created_at", { ascending: false })
        .limit(24);

      if (requestId !== reportLoadRequestRef.current) return;

      if (error) {
        if (error.code === "42P01") {
          setSchemaError(
            "Parking schema not found. Run Supabase migrations before using this module."
          );
        } else {
          setSchemaError(error.message || "Unable to load reports.");
        }
        setReports([]);
        if (showLoader) setIsLoadingReports(false);
        return;
      }

      setSchemaError("");
      const rows = (data || []) as ParkingReportRow[];
      setLastReportRefreshAt(Date.now());

      setReports((prev) => {
        if (
          prev.length === rows.length &&
          prev.every((row, index) => {
            const next = rows[index];
            return (
              row.id === next.id &&
              row.status === next.status &&
              row.acknowledged_at === next.acknowledged_at &&
              row.resolved_at === next.resolved_at &&
              row.phone_revealed === next.phone_revealed &&
              row.email_sent_at === next.email_sent_at &&
              row.location_description === next.location_description &&
              row.license_plate === next.license_plate
            );
          })
        ) {
          return prev;
        }
        return rows;
      });

      setSelectedReportId((current) => {
        if (current && rows.some((report) => report.id === current)) return current;
        if (reportIdFromQuery && rows.some((report) => report.id === reportIdFromQuery)) {
          return reportIdFromQuery;
        }
        return rows[0]?.id || "";
      });

      if (showLoader) {
        setIsLoadingReports(false);
      }
    },
    [supabase, reportIdFromQuery]
  );

  const loadMessages = useCallback(
    async (reportId: string) => {
      const requestId = ++messageLoadRequestRef.current;

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

      if (requestId !== messageLoadRequestRef.current) return;

      if (error) {
        if (error.code !== "42P01") {
          setThreadActionError(error.message || "Unable to load chat thread.");
        }
        return;
      }

      const rows = (data || []) as ParkingMessageRow[];
      setLastMessageRefreshAt(Date.now());

      setMessages((prev) => {
        const optimisticRows = prev.filter((message) => message.id.startsWith("temp-"));
        const nextRows = [...rows, ...optimisticRows];
        if (
          prev.length === nextRows.length &&
          prev.every((message, index) => {
            const next = nextRows[index];
            return (
              message.id === next.id &&
              message.message === next.message &&
              message.created_at === next.created_at
            );
          })
        ) {
          return prev;
        }
        return nextRows;
      });
    },
    [supabase]
  );

  const scheduleReportsReload = useCallback(
    (viewerId: string, delay = 120) => {
      if (!viewerId) return;
      clearReportsReloadTimer();
      reportsReloadTimerRef.current = window.setTimeout(() => {
        void loadReports(viewerId, false);
      }, delay);
    },
    [clearReportsReloadTimer, loadReports]
  );

  const scheduleMessagesReload = useCallback(
    (reportId: string, delay = 80) => {
      if (!reportId) return;
      clearMessagesReloadTimer();
      messagesReloadTimerRef.current = window.setTimeout(() => {
        void loadMessages(reportId);
      }, delay);
    },
    [clearMessagesReloadTimer, loadMessages]
  );

  const triggerEscalationSync = useCallback(async () => {
    if (escalationSyncInFlightRef.current) return;
    escalationSyncInFlightRef.current = true;
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "";
      const result = await triggerParkingEscalationAction(origin);
      if (!result.ok && result.error) {
        console.error("Escalation sync failed:", result.error);
      }
    } finally {
      escalationSyncInFlightRef.current = false;
    }
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
    setLastServerSyncAt(Date.now());
  }, [supabase]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
      clearReportsReloadTimer();
      clearMessagesReloadTimer();
    };
  }, [photoPreview, clearReportsReloadTimer, clearMessagesReloadTimer]);

  useEffect(() => {
    const message = threadActionError || schemaError || submitError;
    if (!message) return;
    setMobileToast({ kind: "error", message });
  }, [threadActionError, schemaError, submitError]);

  useEffect(() => {
    if (!submitMessage) return;
    setMobileToast({ kind: "success", message: submitMessage });
  }, [submitMessage]);

  useEffect(() => {
    if (!copyDetailsMessage) return;
    setMobileToast({ kind: "info", message: copyDetailsMessage });
  }, [copyDetailsMessage]);

  useEffect(() => {
    if (!isLoggedIn) return;

    void syncServerClock();
    const timer = window.setInterval(() => {
      void syncServerClock();
    }, 30000);

    return () => window.clearInterval(timer);
  }, [isLoggedIn, syncServerClock]);

  useEffect(() => {
    let active = true;
    let authRetryTimer: number | null = null;

    const applySessionState = async (nextUserId: string, showLoader = false) => {
      if (!active) return;
      setUserId(nextUserId);
      setIsLoggedIn(Boolean(nextUserId));
      await loadReports(nextUserId, showLoader);
    };

    const clearAuthRetryTimer = () => {
      if (authRetryTimer) {
        window.clearTimeout(authRetryTimer);
        authRetryTimer = null;
      }
    };

    const bootstrap = async (attempt = 0) => {
      try {
        const { user, errorMessage } = await resolveClientUser(supabase);
        const resolvedUserId = user?.id || "";

        if (!resolvedUserId && isTransientParkingAuthError(errorMessage) && attempt < MAX_AUTH_RETRY_ATTEMPTS) {
          clearAuthRetryTimer();
          authRetryTimer = window.setTimeout(() => {
            if (!active) return;
            void bootstrap(attempt + 1);
          }, AUTH_RETRY_DELAY_MS * (attempt + 1));
          return;
        }

        clearAuthRetryTimer();
        await applySessionState(resolvedUserId, true);
      } catch (error) {
        console.error("Parking patrol auth bootstrap failed:", error);
        await applySessionState("", true);
      }
    };

    void bootstrap();

    const { data: authListener } = supabase.auth.onAuthStateChange(async () => {
      const { user, errorMessage } = await resolveClientUser(supabase);
      const resolvedUserId = user?.id || "";

      if (!resolvedUserId && isTransientParkingAuthError(errorMessage)) {
        clearAuthRetryTimer();
        authRetryTimer = window.setTimeout(() => {
          if (!active) return;
          void bootstrap(0);
        }, AUTH_RETRY_DELAY_MS);
        return;
      }

      clearAuthRetryTimer();
      await applySessionState(resolvedUserId, false);
    });

    return () => {
      active = false;
      clearAuthRetryTimer();
      authListener.subscription.unsubscribe();
    };
  }, [supabase, loadReports]);

  useEffect(() => {
    if (reportIdFromQuery && reports.some((report) => report.id === reportIdFromQuery)) {
      setSelectedReportId(reportIdFromQuery);
    }
  }, [reportIdFromQuery, reports]);

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
          scheduleReportsReload(userId, 60);
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
          scheduleReportsReload(userId, 60);
        }
      )
      .subscribe((status) => {
        setReportChannelStatus(mapChannelStatus(status));
      });

    return () => {
      supabase.removeChannel(reportChannel);
      setReportChannelStatus("idle");
    };
  }, [supabase, userId, scheduleReportsReload]);

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
          scheduleMessagesReload(selectedReportId, 40);
        }
      )
      .subscribe((status) => {
        setMessageChannelStatus(mapChannelStatus(status));
      });

    return () => {
      supabase.removeChannel(messageChannel);
      setMessageChannelStatus("idle");
    };
  }, [supabase, selectedReportId, scheduleMessagesReload]);

  const selectedReport = reports.find((report) => report.id === selectedReportId) || null;
  const synchronizedNowMs = clockMs + serverClockOffsetMs;
  const stageMeta = getStageMeta(selectedReport, synchronizedNowMs);
  const isReporter = selectedReport?.reported_by === userId;
  const isOwner = selectedReport?.matched_owner_id === userId;
  const chatWindowOpen = isChatWindowOpen(selectedReport, synchronizedNowMs);
  const isChatReadOnly = Boolean(
    !selectedReport ||
      selectedReport.status === "unmatched" ||
      selectedReport.status === "resolved" ||
      !chatWindowOpen
  );

  const canOwnerAcknowledge = canOwnerAcknowledgeReport(selectedReport, userId);
  const canReporterResolve = canReporterResolveReport(selectedReport, userId);
  const canCancelReport = canReporterCancelReport(selectedReport, userId, synchronizedNowMs);
  const canMarkUnresolved = canReporterMarkUnresolved(selectedReport, userId, synchronizedNowMs);
  const canCallOwner = canReporterRevealOwnerPhone(selectedReport, userId, synchronizedNowMs);
  const ownerPhone = selectedReport ? revealedPhoneByReport[selectedReport.id] || "" : "";
  const selectedReportPhotoUrl = selectedReport ? reportPhotoUrlById[selectedReport.id] || "" : "";
  const unresolvedCountdown = selectedReport?.acknowledged_at
    ? formatFiveMinuteCountdown(selectedReport.acknowledged_at, synchronizedNowMs)
    : "5:00";
  const chatLockReason = getThreadLockReason(selectedReport, chatWindowOpen);
  const circleRadius = 52;
  const circleLength = 2 * Math.PI * circleRadius;
  const circleOffset = circleLength * (1 - stageMeta.progress);
  const serverClockDriftSeconds = Math.round(Math.abs(serverClockOffsetMs) / 1000);

  const overallFeedStatus: LiveChannelStatus =
    reportChannelStatus === "error" || messageChannelStatus === "error"
      ? "error"
      : reportChannelStatus === "live" && (messageChannelStatus === "live" || !selectedReportId)
        ? "live"
        : reportChannelStatus === "idle" && messageChannelStatus === "idle"
          ? "idle"
          : "connecting";

  const queueTitle = reports.length === 1 ? "1 live incident" : `${reports.length} live incidents`;

  useEffect(() => {
    const element = messageListRef.current;
    if (!element) return;

    const onScroll = () => {
      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      shouldStickToBottomRef.current = distanceFromBottom < CHAT_SCROLL_BOTTOM_THRESHOLD;
    };

    onScroll();
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
    };
  }, [selectedReport?.id]);

  useEffect(() => {
    const textarea = chatInputRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }, [threadDraft]);

  useEffect(() => {
    const element = messageListRef.current;
    if (!element) return;

    const reportChanged = lastRenderedReportIdRef.current !== (selectedReport?.id || "");
    const lastMessage = messages[messages.length - 1];
    const isOwnLatestMessage =
      Boolean(lastMessage?.sender_id) && String(lastMessage?.sender_id) === String(userId);

    if (reportChanged || shouldStickToBottomRef.current || isOwnLatestMessage) {
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight;
      });
      shouldStickToBottomRef.current = true;
    }

    lastRenderedReportIdRef.current = selectedReport?.id || "";
  }, [messages, selectedReport?.id, userId]);

  useEffect(() => {
    if (!isLoggedIn || !userId) return;

    const dueCandidates = reports.filter((report) => {
      if (report.reported_by !== userId) return false;
      if (!["pending", "chatting"].includes(String(report.status || ""))) return false;
      if (String(report.email_sent_at || "").trim()) return false;
      if (getElapsedSeconds(report.created_at, synchronizedNowMs) < 55) return false;
      if (escalatedReportsRef.current.has(report.id)) return false;
      return true;
    });

    if (dueCandidates.length === 0) return;

    dueCandidates.forEach((candidate) => escalatedReportsRef.current.add(candidate.id));
    void triggerEscalationSync();
  }, [isLoggedIn, reports, synchronizedNowMs, triggerEscalationSync, userId]);

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

  useEffect(() => {
    const reporterId = String(selectedReport?.reported_by || "");
    const ownerId = String(selectedReport?.matched_owner_id || "");
    const participantIds = Array.from(new Set([reporterId, ownerId].filter(Boolean)));
    if (participantIds.length === 0) return;

    let cancelled = false;

    const loadParticipantTags = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, first_name, last_name, avatar_url")
        .in("id", participantIds);

      if (cancelled || error) return;

      const tagMap: Record<string, string> = {};
      const avatarMap: Record<string, string> = {};
      ((data || []) as ProfileIdentityRow[]).forEach((row) => {
        const tag = formatThreadParticipantTag(row);
        if (tag) {
          tagMap[row.id] = tag;
        }

        const avatarUrl = String(row.avatar_url || "").trim();
        if (avatarUrl) {
          avatarMap[row.id] = avatarUrl;
        }
      });

      setParticipantTagById((prev) => ({ ...prev, ...tagMap }));
      setParticipantAvatarById((prev) => ({ ...prev, ...avatarMap }));
    };

    void loadParticipantTags();

    return () => {
      cancelled = true;
    };
  }, [selectedReport?.id, selectedReport?.reported_by, selectedReport?.matched_owner_id, supabase]);

  const runOcr = async (imageFile: File) => {
    setIsRunningOcr(true);
    setSubmitError("");
    setSubmitMessage("");

    try {
      const ocrPayload = new FormData();
      ocrPayload.append("photo", imageFile);
      const detected = await detectParkingPlateFromPhotoAction(ocrPayload);

      if (!detected.ok) {
        throw new Error(detected.error || "Unable to detect a number plate from this photo.");
      }

      const extractedText = String(detected.rawText || detected.plate || "").trim();
      setOcrRawText(extractedText);

      const normalized = normalizeParkingReportPlateForSubmission({
        manualPlate: "",
        ocrRawText: String(detected.plate || extractedText),
      });
      const fallbackFormatted = formatParkingReportPlateInput(String(detected.plate || extractedText));
      const plateToApply = normalized.plate || fallbackFormatted;
      if (plateToApply) {
        setPlateInput(plateToApply);
        setSubmitMessage("Plate detected from the image. You can still edit it before submitting.");
      } else {
        setSubmitError("Could not detect a clear plate from the image. Please enter it manually.");
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to detect a plate right now. Please enter it manually."
      );
    } finally {
      setIsRunningOcr(false);
    }
  };

  const clearPhotoSelection = useCallback(() => {
    setOcrRawText("");
    setPendingOcrFile(null);
    setOcrDialogOpen(false);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview("");
  }, [photoPreview]);

  const resetReportForm = useCallback(() => {
    setPlateInput("");
    setLocationInput("");
    setSelectedLocationChip("Other");
    clearPhotoSelection();
  }, [clearPhotoSelection]);

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
      setPendingOcrFile(compressedFile);
      setOcrDialogOpen(true);
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

    if (locationValue.length > LOCATION_DESCRIPTION_MAX_LENGTH) {
      setSubmitError(
        `Location description must be ${LOCATION_DESCRIPTION_MAX_LENGTH} characters or less.`
      );
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
      let reportedAtIso = new Date().toISOString();
      let incidentPhotoUrl = "";

      if (result.reportId) {
        const { data: createdReport } = await supabase
          .from("parking_reports")
          .select("created_at, photo_url")
          .eq("id", result.reportId)
          .maybeSingle();

        if (createdReport?.created_at) {
          reportedAtIso = String(createdReport.created_at);
        }

        const photoPath = String(createdReport?.photo_url || "").trim();
        if (photoPath) {
          const signedPhotoResult = await getParkingIncidentPhotoUrlAction(photoPath);
          if (signedPhotoResult.ok && signedPhotoResult.url) {
            incidentPhotoUrl = signedPhotoResult.url;
          }
        }
      }

      setSubmitMessage(
        `Vehicle ${finalPlate} is not registered in NIE Campus Sync.\nYour report has been logged for record-keeping.`
      );
      setUnmatchedReport({
        reportId: String(result.reportId || ""),
        plate: finalPlate,
        location: locationValue,
        reportedAtIso,
        incidentPhotoUrl,
      });
    } else {
      setSubmitMessage("Report submitted successfully. The owner has been notified.");
      setUnmatchedReport(null);
    }

    resetReportForm();
    setReportPanelOpen(false);

    if (userId) {
      await loadReports(userId);
    }

    if (result.reportId && !result.unmatched) {
      setSelectedReportId(result.reportId);
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          void triggerEscalationSync();
        }, 65000);
      }
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

  const handleDownloadUnmatchedPdf = async () => {
    if (!unmatchedReport || typeof window === "undefined") return;
    const pdfResult = await downloadParkingIncidentReportPdf({
      reportId: unmatchedReport.reportId,
      plate: unmatchedReport.plate,
      location: unmatchedReport.location,
      status: "unmatched",
      createdAtIso: unmatchedReport.reportedAtIso,
      generatedAtIso: new Date().toISOString(),
      incidentPhotoUrl: unmatchedReport.incidentPhotoUrl || "",
      reporterNote: unmatchedReport.location,
    });

    if (!pdfResult.ok) {
      setCopyDetailsMessage(pdfResult.error || "Unable to download report PDF.");
      return;
    }

    setCopyDetailsMessage("Report PDF downloaded.");
  };

  const handleSendThreadMessage = async () => {
    if (!selectedReport || !threadDraft.trim()) return;
    if (isChatReadOnly) {
      setThreadActionError("Chat window is closed for this report.");
      return;
    }

    const draftMessage = threadDraft.trim();
    const tempMessageId = `temp-${Date.now()}`;
    const optimisticSenderRole: ParkingMessageRow["sender_role"] = isOwner ? "owner" : "reporter";

    setMessages((prev) => [
      ...prev,
      {
        id: tempMessageId,
        report_id: selectedReport.id,
        sender_id: userId || null,
        sender_role: optimisticSenderRole,
        message: draftMessage,
        created_at: new Date().toISOString(),
      },
    ]);
    setThreadDraft("");
    setIsSendingMessage(true);
    setThreadActionError("");

    const response = await sendParkingMessageAction(selectedReport.id, draftMessage);
    setIsSendingMessage(false);

    if (!response.ok) {
      setMessages((prev) => prev.filter((message) => message.id !== tempMessageId));
      setThreadDraft(draftMessage);
      setThreadActionError(response.error || "Unable to send message.");
      requestAnimationFrame(() => chatInputRef.current?.focus());
      return;
    }

    setMessages((prev) => prev.filter((message) => message.id !== tempMessageId));
    scheduleMessagesReload(selectedReport.id, 0);
    if (userId) {
      scheduleReportsReload(userId, 0);
    }

    requestAnimationFrame(() => chatInputRef.current?.focus());
  };

  const handleOwnerAcknowledge = async () => {
    if (!selectedReport) return;
    setIsAcknowledging(true);
    setThreadActionError("");

    setReports((prev) =>
      prev.map((report) =>
        report.id === selectedReport.id
          ? {
              ...report,
              status: "acknowledged",
              acknowledged_at: report.acknowledged_at || new Date().toISOString(),
            }
          : report
      )
    );

    const result = await ownerImMovingAction(selectedReport.id);
    setIsAcknowledging(false);

    if (!result.ok) {
      setThreadActionError(result.error || "Unable to acknowledge movement.");
      scheduleReportsReload(userId, 0);
      return;
    }

    if (userId) {
      scheduleReportsReload(userId, 0);
    }
    scheduleMessagesReload(selectedReport.id, 0);
  };

  const handleReporterResolve = async () => {
    if (!selectedReport) return;
    setIsResolving(true);
    setThreadActionError("");

    const resolvedId = selectedReport.id;
    const nextReportId = reports.find((report) => report.id !== resolvedId)?.id || "";
    setSelectedReportId(nextReportId);
    setReports((prev) => prev.filter((report) => report.id !== resolvedId));

    const result = await reporterMarkResolvedAction(resolvedId);
    setIsResolving(false);

    if (!result.ok) {
      setThreadActionError(result.error || "Unable to mark resolved.");
      if (userId) {
        scheduleReportsReload(userId, 0);
      }
      return;
    }

    setMobileToast({ kind: "success", message: "Report resolved and moved out of the live queue." });
    if (userId) {
      scheduleReportsReload(userId, 0);
    }
  };

  const handleReporterCancel = async () => {
    if (!cancelTargetReportId) return;

    setIsCancelling(true);
    setThreadActionError("");

    const nextReportId = reports.find((report) => report.id !== cancelTargetReportId)?.id || "";
    setSelectedReportId(nextReportId);
    setReports((prev) => prev.filter((report) => report.id !== cancelTargetReportId));

    const result = await reporterCancelReportAction(cancelTargetReportId);
    setIsCancelling(false);

    if (!result.ok) {
      setThreadActionError(result.error || "Unable to cancel this report.");
      if (userId) {
        scheduleReportsReload(userId, 0);
      }
      return;
    }

    setCancelConfirmOpen(false);
    setCancelTargetReportId("");
    setThreadDraft("");
    setMobileToast({ kind: "success", message: "Report cancelled." });
    if (userId) {
      scheduleReportsReload(userId, 0);
    }
  };

  const openCancelConfirmation = () => {
    if (!selectedReport) return;
    setCancelTargetReportId(selectedReport.id);
    setCancelConfirmOpen(true);
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

    if (userId) {
      scheduleReportsReload(userId, 0);
    }
    scheduleMessagesReload(selectedReport.id, 0);
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
    setReports((prev) =>
      prev.map((report) =>
        report.id === selectedReport.id
          ? {
              ...report,
              phone_revealed: true,
            }
          : report
      )
    );

    if (userId) {
      scheduleReportsReload(userId, 0);
    }
    scheduleMessagesReload(selectedReport.id, 0);

    if (typeof window !== "undefined") {
      window.location.href = `tel:${phone}`;
    }
  };

  const handleDownloadTranscript = async () => {
    if (!selectedReport || messages.length === 0) return;
    setIsDownloadingTranscript(true);

    let incidentPhotoUrl = selectedReportPhotoUrl;
    if (!incidentPhotoUrl && selectedReport.photo_url) {
      const signedPhoto = await getParkingIncidentPhotoUrlAction(selectedReport.photo_url);
      if (signedPhoto.ok && signedPhoto.url) {
        incidentPhotoUrl = signedPhoto.url;
      }
    }

    const transcriptLines = messages.map((message) => {
      const label = getThreadRoleLabel(message, selectedReport, userId, participantTagById);
      return `[${new Date(message.created_at).toLocaleString()}] ${label}: ${message.message}`;
    });

    const pdfResult = await downloadParkingTranscriptPdf({
      reportId: selectedReport.id,
      plate: selectedReport.license_plate,
      location: selectedReport.location_description,
      status: selectedReport.status,
      createdAtIso: selectedReport.created_at,
      resolvedAtIso: selectedReport.resolved_at,
      generatedAtIso: new Date().toISOString(),
      incidentPhotoUrl,
      transcriptLines,
    });

    setIsDownloadingTranscript(false);

    if (!pdfResult.ok) {
      setThreadActionError(pdfResult.error || "Unable to download transcript PDF.");
      return;
    }

    setMobileToast({ kind: "info", message: "Transcript PDF downloaded." });
  };

  return (
    <main className="min-h-[100dvh] w-full bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_34%),radial-gradient(circle_at_88%_14%,rgba(245,166,35,0.14),transparent_36%),linear-gradient(180deg,#050505_0%,#080808_100%)] px-4 pb-24 pt-28 text-white sm:px-5 lg:px-8">
      <MobileToast
        kind={mobileToast?.kind || "info"}
        message={mobileToast?.message || ""}
        open={Boolean(mobileToast?.message)}
        onClose={() => setMobileToast(null)}
      />

      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        <header className="brand-panel animate-enter-soft overflow-hidden p-5 sm:p-6">
          <div className="absolute inset-0 animate-panel-glow bg-[radial-gradient(circle_at_10%_20%,rgba(37,99,235,0.18),transparent_28%),radial-gradient(circle_at_90%_0%,rgba(245,166,35,0.18),transparent_26%)]" />
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">
                <span className="pulse-dot inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                Parking Patrol
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Incident Desk
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-[15px]">
                Report blocked vehicles and communicate with owners instantly to resolve parking issues.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold", getSyncTone(overallFeedStatus))}>
                  <span
                    className={cn(
                      "inline-flex h-2 w-2 rounded-full",
                      overallFeedStatus === "live"
                        ? "bg-emerald-400"
                        : overallFeedStatus === "error"
                          ? "bg-red-400"
                          : "bg-white/55"
                    )}
                  />
                  {overallFeedStatus === "live"
                    ? "Realtime connected"
                    : overallFeedStatus === "error"
                      ? "Realtime reconnecting"
                      : "Realtime syncing"}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70">
                  <Clock3 className="h-3.5 w-3.5" />
                  Clock synced {lastServerSyncAt ? formatAgeFromMs(lastServerSyncAt) : "pending"}
                  {serverClockDriftSeconds >= 2 ? ` · drift ${serverClockDriftSeconds}s compensated` : ""}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reports {lastReportRefreshAt ? formatAgeFromMs(lastReportRefreshAt) : "waiting"}
                  {selectedReportId
                    ? ` · Thread ${lastMessageRefreshAt ? formatAgeFromMs(lastMessageRefreshAt) : "waiting"}`
                    : ""}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setReportPanelOpen(true)}
                className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#f5a623] px-5 text-sm font-bold text-black shadow-[0_14px_30px_rgba(245,166,35,0.22)] transition-transform duration-200 active:scale-[0.98]"
              >
                <ShieldAlert className="h-4 w-4" />
                Report blocked vehicle
              </button>
              <Link
                href="/profile/reports"
                className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.07]"
              >
                <Download className="h-4 w-4" />
                History archive
              </Link>
            </div>
          </div>
        </header>

        {schemaError ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
            {schemaError}
          </div>
        ) : null}



        {unmatchedReport ? (
          <div className="animate-enter-soft overflow-hidden rounded-[26px] border border-amber-300/25 bg-[linear-gradient(135deg,rgba(245,166,35,0.16)_0%,rgba(37,99,235,0.08)_100%)] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)] sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-black/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Unregistered vehicle
                </div>
                <h2 className="mt-3 text-xl font-black tracking-tight text-white">
                  Keep a clean incident record for security follow-up
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/75">
                  This plate is not registered in the system. Save the branded PDF and copy the report
                  snapshot before handing it to campus security.
                </p>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
                    Incident snapshot
                  </p>
                  <p className="mt-2 font-mono text-2xl font-black tracking-[0.18em] text-[#f5a623]">
                    {unmatchedReport.plate}
                  </p>
                  <p className="mt-2 text-sm text-white/70">{unmatchedReport.location}</p>
                </div>
              </div>

              <div className="grid w-full gap-2 sm:grid-cols-2 lg:max-w-[360px]">
                <button
                  type="button"
                  onClick={handleCopyUnmatchedDetails}
                  className="focus-ring inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/85"
                >
                  Copy details
                </button>
                <button
                  type="button"
                  onClick={handleDownloadUnmatchedPdf}
                  className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#f5a623] px-4 text-sm font-bold text-black"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            <div className="brand-panel animate-enter-soft p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                    Live queue
                  </p>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-white">{queueTitle}</h2>
                </div>
                <span className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 text-sm font-bold text-white/85">
                  {reports.length}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {isLoadingReports ? (
                  <div className="space-y-2">
                    <div className="skeleton-shimmer h-24 rounded-2xl" />
                    <div className="skeleton-shimmer h-24 rounded-2xl" />
                    <div className="skeleton-shimmer h-24 rounded-2xl" />
                  </div>
                ) : reports.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/60">
                    No live incident is open right now. Start a new report and the thread will appear here instantly.
                  </div>
                ) : (
                  <div className="max-h-[55dvh] space-y-2 overflow-y-auto pr-1 thin-scrollbar">
                    {reports.map((report) => {
                      const queueStage = getStageMeta(report, synchronizedNowMs);
                      const selected = report.id === selectedReportId;
                      const reportRole =
                        report.reported_by === userId ? "Reporter" : report.matched_owner_id === userId ? "Owner" : "Participant";

                      return (
                        <button
                          key={report.id}
                          type="button"
                          onClick={() => {
                            setSelectedReportId(report.id);
                            requestAnimationFrame(() => {
                              messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight });
                            });
                          }}
                          className={cn(
                            "focus-ring group w-full rounded-2xl border p-4 text-left transition-all duration-200",
                            selected
                              ? "border-[#f5a623]/35 bg-[#f5a623]/10 shadow-[0_14px_32px_rgba(245,166,35,0.12)]"
                              : "border-white/10 bg-black/20 hover:border-white/15 hover:bg-white/[0.04]"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-mono text-lg font-black tracking-[0.16em] text-[#f5a623]">
                                {report.license_plate}
                              </p>
                              <p className="mt-1 line-clamp-2 text-sm leading-5 text-white/70">
                                {report.location_description}
                              </p>
                            </div>
                            <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_THEME[report.status])}>
                              {formatParkingStatus(report.status)}
                            </span>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                                {reportRole}
                              </p>
                              <p className="mt-1 text-xs text-white/55">{formatElapsed(report.created_at)}</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right">
                              <p className="font-mono text-sm font-black text-white">{queueStage.display}</p>
                              <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">
                                {queueStage.activeStep === 0
                                  ? "Chat"
                                  : queueStage.activeStep === 1
                                    ? "Email"
                                    : "Call"}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>


          </aside>

          <div className="space-y-4">
            {!selectedReport ? (
              <div className="brand-panel animate-enter-soft p-6">
                <div className="mx-auto max-w-2xl py-10 text-center">
                  <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-[22px] border border-[#f5a623]/20 bg-[#f5a623]/10 text-[#f5a623]">
                    <MessageSquare className="h-7 w-7" />
                  </span>
                  <h2 className="mt-4 text-2xl font-black tracking-tight text-white">
                    No live thread selected
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-white/65">
                    Open a report from the queue or start a new one.
                  </p>
                  <button
                    type="button"
                    onClick={() => setReportPanelOpen(true)}
                    className="focus-ring mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#f5a623] px-5 text-sm font-bold text-black"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Create report
                  </button>
                </div>
              </div>
            ) : (
              <>
                <section className="brand-panel animate-enter-soft overflow-hidden p-4 sm:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", STATUS_THEME[selectedReport.status])}>
                          {formatParkingStatus(selectedReport.status)}
                        </span>
                        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", getSyncTone(overallFeedStatus))}>
                          {overallFeedStatus === "live"
                            ? "Live feed on"
                            : overallFeedStatus === "error"
                              ? "Feed reconnecting"
                              : "Feed syncing"}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/65">
                          Created {formatElapsed(selectedReport.created_at)}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap items-start gap-3">
                        <div>
                          <p className="font-mono text-3xl font-black tracking-[0.2em] text-[#f5a623] sm:text-4xl">
                            {selectedReport.license_plate}
                          </p>
                          <div className="mt-3 flex items-start gap-2 text-sm text-white/70">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/45" />
                            <p className="max-w-2xl leading-6">{selectedReport.location_description}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="surface-elevated w-full max-w-[420px] rounded-[24px] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                            Clock & escalation
                          </p>
                          <p className="mt-1 text-sm text-white/65">
                            Uses the server-adjusted time source to keep timers stable across devices.
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/70">
                          <Clock3 className="h-3.5 w-3.5" />
                          {lastServerSyncAt ? formatAgeFromMs(lastServerSyncAt) : "syncing"}
                        </span>
                      </div>

                      <div className="mt-4 rounded-[22px] border border-white/10 bg-black/25 p-4">
                        <div className="px-1 pb-4">
                          <div className="relative flex items-start justify-between gap-2">
                            <div className="absolute left-3 right-3 top-3 h-[2px] rounded-full bg-white/10" />
                            <div className="absolute left-3 right-3 top-3 flex items-center justify-start">
                              <div
                                className="h-[2px] rounded-full bg-gradient-to-r from-emerald-400 via-[#f5a623] to-red-400 transition-all duration-500"
                                style={{ width: `${Math.max(0, Math.min(100, stageMeta.railProgress))}%` }}
                              />
                            </div>
                            {STAGE_STEP_LABELS.map((label, index) => {
                              const completed = stageMeta.railProgress >= (index + 1) * 33;
                              const active = stageMeta.activeStep === index;
                              return (
                                <div key={label} className="relative z-10 flex flex-col items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "inline-flex h-6 w-6 rounded-full border-2 shadow-[0_0_0_4px_rgba(8,8,8,1)] transition-colors",
                                      completed
                                        ? "border-emerald-400 bg-emerald-400"
                                        : active
                                          ? "border-[#f5a623] bg-[#f5a623]"
                                          : "border-white/30 bg-[#101010]"
                                    )}
                                  />
                                  <span
                                    className={cn(
                                      "text-[10px] font-semibold uppercase tracking-[0.12em]",
                                      completed
                                        ? "text-emerald-200"
                                        : active
                                          ? "text-[#f5a623]"
                                          : "text-white/40"
                                    )}
                                  >
                                    {label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-col items-center justify-center">
                          <div className="relative h-28 w-28 sm:h-32 sm:w-32">
                            <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
                              <circle cx="60" cy="60" r={circleRadius} stroke="rgba(255,255,255,0.08)" strokeWidth="7" fill="none" />
                              <circle
                                cx="60"
                                cy="60"
                                r={circleRadius}
                                stroke={stageMeta.ringColor}
                                strokeWidth="7"
                                fill="none"
                                strokeDasharray={circleLength}
                                strokeDashoffset={circleOffset}
                                strokeLinecap="round"
                                className="transition-all duration-1000 ease-linear"
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="font-mono text-[30px] font-black tracking-tight text-white sm:text-[34px]">
                                {stageMeta.display}
                              </span>
                            </div>
                          </div>

                          <p className="mt-3 text-sm font-semibold text-white">{stageMeta.label}</p>
                          <p className="mt-1 max-w-[260px] text-center text-xs leading-5 text-white/55">
                            {stageMeta.caption}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedReportPhotoUrl ? (
                    <div className="mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-black/20">
                      <img
                        src={selectedReportPhotoUrl}
                        alt={`Incident photo for ${selectedReport.license_plate}`}
                        className="h-[260px] w-full object-cover sm:h-[320px]"
                        loading="lazy"
                      />
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {canOwnerAcknowledge ? (
                      <button
                        type="button"
                        onClick={handleOwnerAcknowledge}
                        disabled={isAcknowledging}
                        className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#f5a623] px-4 text-sm font-bold text-black disabled:opacity-60"
                      >
                        {isAcknowledging ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {isAcknowledging ? "Updating..." : "I’m moving"}
                      </button>
                    ) : null}

                    {canReporterResolve ? (
                      <button
                        type="button"
                        onClick={handleReporterResolve}
                        disabled={isResolving}
                        className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-sm font-bold text-black disabled:opacity-60"
                      >
                        {isResolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {isResolving ? "Resolving..." : "Mark resolved"}
                      </button>
                    ) : null}

                    {isReporter && canCancelReport ? (
                      <button
                        type="button"
                        onClick={openCancelConfirmation}
                        disabled={isCancelling}
                        className="focus-ring inline-flex min-h-12 items-center justify-center rounded-2xl border border-red-400/25 bg-red-400/10 px-4 text-sm font-semibold text-red-200 disabled:opacity-60"
                      >
                        Cancel report
                      </button>
                    ) : null}

                    {isReporter && selectedReport.status === "acknowledged" ? (
                      canMarkUnresolved ? (
                        <button
                          type="button"
                          onClick={handleReporterMarkUnresolved}
                          disabled={isMarkingUnresolved}
                          className="focus-ring inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/85 disabled:opacity-60"
                        >
                          {isMarkingUnresolved ? "Updating..." : "Still blocked"}
                        </button>
                      ) : (
                        <div className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/70">
                          Unresolved opens in {unresolvedCountdown}
                        </div>
                      )
                    ) : null}

                    {canCallOwner ? (
                      <button
                        type="button"
                        onClick={handleRevealAndCall}
                        disabled={isCallingOwner}
                        className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {isCallingOwner ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                        {isCallingOwner ? "Revealing..." : "Reveal & call owner"}
                      </button>
                    ) : null}

                    {ownerPhone ? (
                      <a
                        href={`tel:${ownerPhone}`}
                        className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/85"
                      >
                        <PhoneCall className="h-4 w-4" />
                        {ownerPhone}
                      </a>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        void handleDownloadTranscript();
                      }}
                      disabled={messages.length === 0 || isDownloadingTranscript}
                      className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/85 disabled:opacity-60"
                    >
                      {isDownloadingTranscript ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      {isDownloadingTranscript ? "Preparing transcript..." : "Download transcript"}
                    </button>
                  </div>
                </section>

                <section className="brand-panel animate-enter-soft flex min-h-[540px] flex-col overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                        Live incident thread
                      </p>
                      <h3 className="mt-1 text-lg font-black tracking-tight text-white">
                        Chat
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", getSyncTone(messageChannelStatus === "idle" ? overallFeedStatus : messageChannelStatus))}>
                        {messageChannelStatus === "live"
                          ? "Thread live"
                          : messageChannelStatus === "error"
                            ? "Thread reconnecting"
                            : "Thread syncing"}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/65">
                        {messages.length} {messages.length === 1 ? "message" : "messages"}
                      </span>
                    </div>
                  </div>

                  <div
                    ref={messageListRef}
                    className="thin-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5"
                  >
                    {messages.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-4 text-sm leading-6 text-white/60">
                        No messages yet. The first reply will appear here in real time.
                      </div>
                    ) : (
                      messages.map((message) => {
                        if (message.sender_role === "system") {
                          return (
                            <div key={message.id} className="flex justify-center py-1">
                              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/45">
                                {message.message}
                              </div>
                            </div>
                          );
                        }

                        const isOwnMessage = message.sender_id
                          ? message.sender_id === userId
                          : (isReporter && message.sender_role === "reporter") ||
                            (isOwner && message.sender_role === "owner");
                        const senderId = String(
                          message.sender_id ||
                            (message.sender_role === "reporter"
                              ? selectedReport?.reported_by || ""
                              : selectedReport?.matched_owner_id || "")
                        ).trim();
                        const senderAvatarUrl = senderId ? participantAvatarById[senderId] || "" : "";
                        const senderLabel = getThreadRoleLabel(message, selectedReport, userId, participantTagById);
                        const senderFallbackName = String(
                          (senderId ? participantTagById[senderId] : "") || senderLabel || "U"
                        );
                        const senderInitial =
                          String(senderFallbackName || "U")
                            .replace(/[^A-Za-z0-9]/g, "")
                            .slice(0, 1)
                            .toUpperCase() || "U";

                        return (
                          <div key={message.id} className={cn("flex", isOwnMessage ? "justify-end" : "justify-start")}>
                            <div className={cn("flex max-w-[92%] items-end gap-2.5", isOwnMessage ? "flex-row-reverse" : "")}>
                              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.08] text-[11px] font-bold uppercase text-white/85">
                                {senderAvatarUrl ? (
                                  <img
                                    src={senderAvatarUrl}
                                    alt={`${senderLabel} avatar`}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  senderInitial
                                )}
                              </span>

                              <div className="max-w-[calc(100%-2.75rem)]">
                                <p className={cn("mb-1 text-[11px] font-medium text-white/40", isOwnMessage ? "text-right" : "")}>
                                  {senderLabel}
                                </p>
                                <div
                                  className={cn(
                                    "rounded-[20px] px-4 py-3 text-sm leading-6 shadow-[0_10px_24px_rgba(0,0,0,0.18)]",
                                    isOwnMessage
                                      ? "rounded-br-md border border-[#f5a623]/20 bg-[#f5a623]/14 text-[#ffd48a]"
                                      : "rounded-bl-md border border-white/10 bg-white/[0.05] text-white/85"
                                  )}
                                >
                                  {message.message}
                                </div>
                                <p className={cn("mt-1 text-[11px] text-white/35", isOwnMessage ? "text-right" : "")}>
                                  {new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="border-t border-white/10 bg-black/20 px-4 py-4 safe-pb sm:px-5">
                    {chatLockReason ? (
                      <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/65">
                        {chatLockReason}
                      </div>
                    ) : null}

                    <div className="flex items-end gap-3">
                      <div className="flex-1 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3">
                        <textarea
                          ref={chatInputRef}
                          value={threadDraft}
                          onChange={(event) => setThreadDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void handleSendThreadMessage();
                            }
                          }}
                          placeholder={isChatReadOnly ? "Chat is currently read-only" : "Type a message..."}
                          disabled={isChatReadOnly || isSendingMessage}
                          rows={1}
                          className="focus-ring max-h-[140px] min-h-[24px] w-full resize-none bg-transparent text-sm leading-6 text-white placeholder:text-white/30"
                        />
                        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-white/35">
                          <span>Enter to send · Shift + Enter for a new line</span>
                          <span>{threadDraft.trim().length} chars</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleSendThreadMessage}
                        disabled={isChatReadOnly || !threadDraft.trim() || isSendingMessage}
                        className="focus-ring inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f5a623] text-black shadow-[0_12px_28px_rgba(245,166,35,0.2)] transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
                        aria-label="Send message"
                      >
                        {isSendingMessage ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Send className="h-5 w-5" />
                        )}
                      </button>
                    </div>

                    {threadActionError ? (
                      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p className="leading-6">{threadActionError}</p>
                      </div>
                    ) : null}
                  </div>
                </section>
              </>
            )}
          </div>
        </section>
      </div>

      {reportPanelOpen ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/72 p-4 backdrop-blur-md sm:items-center">
          <div className="brand-panel animate-enter-soft relative flex max-h-[92dvh] w-full max-w-[980px] flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  Report blocked vehicle
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-white">
                  Submit Details
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
                  Provide vehicle and location details to report a parking incident.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isSubmitting) return;
                  setReportPanelOpen(false);
                }}
                className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80"
                aria-label="Close report form"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="thin-scrollbar flex-1 overflow-y-auto px-5 py-5">
              {submitMessage || submitError ? (
                <div
                  className={cn(
                    "mb-5 animate-enter-soft rounded-2xl border p-4 text-sm shadow-[0_12px_28px_rgba(0,0,0,0.28)]",
                    submitError
                      ? "border-red-500/20 bg-red-500/10 text-red-200"
                      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {submitError ? (
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    )}
                    <div className="whitespace-pre-line leading-6">{submitError || submitMessage}</div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <div className="space-y-5">
                  <section className="surface-elevated rounded-[24px] p-4">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#f5a623]/20 bg-[#f5a623]/10 text-[#f5a623]">
                        <Camera className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                          Incident photo
                        </p>
                        <p className="mt-1 text-sm leading-6 text-white/65">
                          Optional, but recommended for OCR and stronger incident records.
                        </p>
                      </div>
                    </div>

                    <label className="mt-4 block cursor-pointer">
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
                        <div className="group relative overflow-hidden rounded-[22px] border border-white/10 bg-black/25">
                          <img src={photoPreview} alt="Incident preview" className="h-[260px] w-full object-cover sm:h-[320px]" />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-white">Photo attached</p>
                                <p className="mt-1 text-xs text-white/65">
                                  {isRunningOcr ? "Running OCR..." : "Tap again to replace with another photo"}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  clearPhotoSelection();
                                }}
                                className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/65 text-white"
                                aria-label="Remove photo"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-[24px] border-2 border-dashed border-white/10 bg-white/[0.03] p-6 text-center transition-colors hover:border-[#f5a623]/25 hover:bg-white/[0.04]">
                          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.04] text-white/60">
                            <UploadCloud className="h-6 w-6" />
                          </span>
                          <p className="mt-4 text-sm font-semibold text-white">Tap to capture or upload</p>
                          <p className="mt-1 text-xs text-white/45">
                            The image is compressed automatically for faster submission.
                          </p>
                        </div>
                      )}
                    </label>
                  </section>

                  <section className="surface-elevated rounded-[24px] p-4">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#f5a623]/20 bg-[#f5a623]/10 text-[#f5a623]">
                        <ShieldAlert className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                          Vehicle plate
                        </p>
                        <p className="mt-1 text-sm leading-6 text-white/65">
                          OCR can fill this, but manual editing stays available at every step.
                        </p>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={plateInput}
                      onChange={(event) => setPlateInput(formatParkingReportPlateInput(event.target.value))}
                      placeholder="KA-09-AB-1234"
                      className="focus-ring mt-4 w-full rounded-[22px] border border-white/10 bg-black/25 px-4 py-4 text-center font-mono text-2xl font-black tracking-[0.22em] text-[#f5a623] placeholder:text-sm placeholder:tracking-[0.18em] placeholder:text-white/25 sm:text-[28px]"
                    />
                    <p className="mt-2 text-xs text-white/45">{getOwnerVehiclePlateFormatsHint()}</p>

                    {photoFile ? (
                      <div className="mt-4 rounded-2xl border border-[#f5a623]/15 bg-[#f5a623]/8 px-4 py-3 text-sm text-white/75">
                        {isRunningOcr ? "Detecting the plate from your uploaded image..." : "Photo attached. Plate can be auto-filled or edited manually."}
                      </div>
                    ) : null}
                  </section>
                </div>

                <div className="space-y-5">
                  <section className="surface-elevated rounded-[24px] p-4">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#f5a623]/20 bg-[#f5a623]/10 text-[#f5a623]">
                        <MapPin className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                          Blocking location
                        </p>
                        <p className="mt-1 text-sm leading-6 text-white/65">
                          Pick a known hotspot or type a precise description for security and the owner.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
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
                            className={cn(
                              "focus-ring rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors",
                              selected
                                ? "border border-[#f5a623]/25 bg-[#f5a623]/12 text-[#ffd48a]"
                                : "border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.06]"
                            )}
                          >
                            {zone}
                          </button>
                        );
                      })}
                    </div>

                    <textarea
                      value={locationInput}
                      onChange={(event) =>
                        setLocationInput(
                          String(event.target.value || "").slice(0, LOCATION_DESCRIPTION_MAX_LENGTH)
                        )
                      }
                      placeholder="Describe the exact blocked point, lane, or entrance"
                      rows={4}
                      maxLength={LOCATION_DESCRIPTION_MAX_LENGTH}
                      className="focus-ring mt-4 w-full resize-none rounded-[22px] border border-white/10 bg-black/25 px-4 py-4 text-sm leading-6 text-white placeholder:text-white/25"
                    />
                    <p className="mt-2 text-right text-[11px] text-white/40">
                      {locationInput.length}/{LOCATION_DESCRIPTION_MAX_LENGTH}
                    </p>
                  </section>

                  <section className="surface-elevated rounded-[24px] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                      Reporting Guidelines
                    </p>
                    <div className="mt-3 space-y-2 text-sm text-white/70">
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        Double-check the license plate before submitting.
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        Provide a brief, clear location where the vehicle is parked.
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        Upload a photo as evidence if possible.
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 bg-black/20 px-5 py-4 safe-pb">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-white/55">
                  Submit once the plate and location look correct. The owner thread opens automatically after creation.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      if (isSubmitting) return;
                      setReportPanelOpen(false);
                    }}
                    className="focus-ring inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/85"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitReport}
                    disabled={isSubmitting || (isLoadingReports && !userId)}
                    className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#f5a623] px-5 text-sm font-bold text-black shadow-[0_14px_30px_rgba(245,166,35,0.22)] disabled:opacity-60"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                    {isSubmitting ? "Submitting..." : "Submit incident report"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {ocrDialogOpen ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/72 p-4 backdrop-blur-sm sm:items-center">
          <div className="surface-elevated rounded-[24px] animate-enter-soft w-full max-w-md p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#f5a623]/20 bg-[#f5a623]/10 text-[#f5a623]">
                <Camera className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  Photo attached
                </p>
                <h3 className="mt-1 text-lg font-black tracking-tight text-white">
                  Choose how to use this image
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  Run OCR for fast plate detection or keep the photo as incident evidence only.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setOcrDialogOpen(false);
                  if (pendingOcrFile) {
                    void runOcr(pendingOcrFile);
                  }
                  setPendingOcrFile(null);
                }}
                className="focus-ring flex min-h-14 w-full items-center gap-3 rounded-2xl border border-[#f5a623]/20 bg-[#f5a623]/10 px-4 text-left"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5a623]/15 text-[#f5a623]">
                  <ShieldAlert className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-[#ffd48a]">Extract number plate</span>
                  <span className="mt-0.5 block text-[11px] text-white/55">Auto-detect and prefill the plate</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOcrDialogOpen(false);
                  setPendingOcrFile(null);
                  setSubmitMessage("Photo added as incident evidence. Enter the plate manually if needed.");
                }}
                className="focus-ring flex min-h-14 w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-left"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-white/80">
                  <Camera className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-white">Use as evidence only</span>
                  <span className="mt-0.5 block text-[11px] text-white/55">Skip OCR and keep manual control</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOcrDialogOpen(false);
                  setPendingOcrFile(null);
                  clearPhotoSelection();
                }}
                className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-white/75"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelConfirmOpen ? (
        <div className="fixed inset-0 z-[125] flex items-end justify-center bg-black/72 p-4 backdrop-blur-sm sm:items-center">
          <div className="surface-elevated rounded-[24px] animate-enter-soft w-full max-w-md p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
              Cancel report
            </p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-white">
              Cancel this live incident?
            </h3>
            <p className="mt-3 text-sm leading-6 text-white/65">
              Cancellation is allowed only during Stage 1. This immediately closes the report and removes it from the live queue.
            </p>
            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={handleReporterCancel}
                disabled={isCancelling}
                className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-red-500 text-sm font-bold text-white disabled:opacity-60"
              >
                {isCancelling ? "Cancelling..." : "Yes, cancel report"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isCancelling) return;
                  setCancelConfirmOpen(false);
                  setCancelTargetReportId("");
                }}
                disabled={isCancelling}
                className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-white/85 disabled:opacity-60"
              >
                Keep report active
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function ParkingPatrolPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[100dvh] w-full bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_34%),radial-gradient(circle_at_88%_14%,rgba(245,166,35,0.14),transparent_36%),linear-gradient(180deg,#050505_0%,#080808_100%)] px-4 pb-24 pt-28 text-white sm:px-5 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px] space-y-4">
            <div className="skeleton-shimmer h-44 rounded-[28px]" />
            <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[390px_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="skeleton-shimmer h-[430px] rounded-[28px]" />
                <div className="skeleton-shimmer h-[280px] rounded-[28px]" />
              </div>
              <div className="space-y-4">
                <div className="skeleton-shimmer h-[420px] rounded-[28px]" />
                <div className="skeleton-shimmer h-[560px] rounded-[28px]" />
              </div>
            </div>
          </div>
        </main>
      }
    >
      <ParkingPatrolPageContent />
    </Suspense>
  );
}
