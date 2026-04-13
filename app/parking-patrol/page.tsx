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
  getOwnerVehiclePlateFormatsHint,
  normalizeParkingReportPlateForSubmission,
  validateParkingReportPlate,
} from "@/lib/vehiclePlate";
import {
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
const LOCATION_DESCRIPTION_MAX_LENGTH = 180;

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

  if (report.status === "acknowledged") {
    return {
      display: "MOVED",
      label: "OWNER ACKNOWLEDGED",
      progress: 1,
      ringColor: "#22c55e",
    };
  }

  if (report.status === "resolved") {
    return {
      display: "OK",
      label: "RESOLVED",
      progress: 1,
      ringColor: "#22c55e",
    };
  }

  const chatElapsed = getElapsedSeconds(report.created_at, nowMs);
  const emailSentAtMs = parseOptionalDateMs(report.email_sent_at);

  if (chatElapsed < CHAT_WINDOW_SECONDS) {
    const remaining = Math.max(0, CHAT_WINDOW_SECONDS - chatElapsed);
    return {
      display: formatCountdown(remaining),
      label: "OWNER RESPONSE",
      progress: Math.min(1, chatElapsed / CHAT_WINDOW_SECONDS),
      ringColor: "#22c55e",
    };
  }

  if (!emailSentAtMs) {
    return {
      display: "WAIT",
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
    display: "NOW",
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

function escapePrintableHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildUnmatchedReportHtml(report: UnmatchedReportSnapshot, appBaseUrl: string) {
  const shortId = (String(report.reportId || "").slice(0, 8).toUpperCase() || "UNKNOWN");
  const reportedAtText = new Date(report.reportedAtIso).toLocaleString();
  const generatedAtText = new Date().toLocaleString();
  const safePlate = escapePrintableHtml(report.plate);
  const safeLocation = escapePrintableHtml(report.location);
  const safeReportId = escapePrintableHtml(shortId);
  const safeReportedAtText = escapePrintableHtml(reportedAtText);
  const safeGeneratedAtText = escapePrintableHtml(generatedAtText);
  const logoUrl = `${appBaseUrl}/logo.png`;
  const faqUrl = `${appBaseUrl}/faq`;
  const termsUrl = `${appBaseUrl}/terms-of-service`;
  const privacyUrl = `${appBaseUrl}/privacy-policy`;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>NIE Sync Parking Incident Report</title>
        <style>
          :root {
            --bg: #f6f8fc;
            --card: #ffffff;
            --ink: #111827;
            --muted: #6b7280;
            --line: #e5e7eb;
            --amber: #f5a623;
            --emerald: #22c55e;
            --sky: #0ea5e9;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: var(--ink);
            background: radial-gradient(circle at top right, #fff4da 0%, var(--bg) 42%);
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .page {
            max-width: 920px;
            margin: 0 auto;
            padding: 28px 18px;
          }
          .card {
            background: var(--card);
            border: 1px solid var(--line);
            border-radius: 20px;
            box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
            overflow: hidden;
          }
          .hero {
            background: linear-gradient(120deg, #0f172a 0%, #111827 42%, #1f2937 100%);
            color: #fff;
            padding: 22px 24px;
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .brand-logo {
            width: 52px;
            height: 52px;
            border-radius: 12px;
            background: #fff;
            border: 1px solid rgba(255,255,255,0.25);
            object-fit: contain;
            padding: 6px;
          }
          .kicker {
            margin: 0;
            color: #f8cc75;
            font-size: 11px;
            letter-spacing: .16em;
            text-transform: uppercase;
            font-weight: 800;
          }
          .title {
            margin: 4px 0 0;
            font-size: 24px;
            font-weight: 900;
            line-height: 1.2;
          }
          .subtitle {
            margin: 10px 0 0;
            color: #cbd5e1;
            font-size: 13px;
            line-height: 1.6;
          }
          .section {
            padding: 22px 24px 2px;
          }
          .section-title {
            margin: 0 0 14px;
            font-size: 11px;
            letter-spacing: .16em;
            text-transform: uppercase;
            color: var(--muted);
            font-weight: 800;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }
          .item {
            border: 1px solid var(--line);
            border-radius: 14px;
            padding: 12px 13px;
            background: #fafafa;
          }
          .item-label {
            margin: 0;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: .12em;
            color: var(--muted);
            font-weight: 700;
          }
          .item-value {
            margin: 6px 0 0;
            font-size: 16px;
            line-height: 1.35;
            font-weight: 800;
            color: var(--ink);
            word-break: break-word;
          }
          .plate {
            font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace;
            color: #b7791f;
            letter-spacing: .06em;
          }
          .banner {
            margin: 18px 24px 2px;
            border: 1px dashed rgba(245, 166, 35, 0.5);
            background: linear-gradient(135deg, rgba(245,166,35,0.11), rgba(14,165,233,0.08));
            border-radius: 14px;
            padding: 14px 14px;
            font-size: 13px;
            line-height: 1.6;
            color: #374151;
          }
          .actions {
            margin: 16px 24px 0;
            border: 1px solid var(--line);
            border-radius: 14px;
            padding: 14px 16px;
            background: #fff;
          }
          .actions h3 {
            margin: 0 0 10px;
            font-size: 12px;
            letter-spacing: .14em;
            text-transform: uppercase;
            color: var(--muted);
          }
          .actions ul {
            margin: 0;
            padding-left: 20px;
            color: #374151;
            font-size: 13px;
            line-height: 1.8;
          }
          .footer {
            padding: 18px 24px 24px;
          }
          .meta {
            margin: 0;
            color: var(--muted);
            font-size: 12px;
            line-height: 1.7;
          }
          .links {
            margin-top: 10px;
            font-size: 12px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
          }
          .links a {
            color: #0284c7;
            text-decoration: none;
            font-weight: 700;
          }
          .dot {
            color: #94a3b8;
          }
          @media (max-width: 640px) {
            .hero, .section, .footer { padding-left: 16px; padding-right: 16px; }
            .banner, .actions { margin-left: 16px; margin-right: 16px; }
            .grid { grid-template-columns: 1fr; }
            .title { font-size: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <article class="card">
            <header class="hero">
              <div class="brand">
                <img src="${escapePrintableHtml(logoUrl)}" alt="NIE Sync Logo" class="brand-logo" />
                <div>
                  <p class="kicker">NIE Sync</p>
                  <h1 class="title">Unregistered Vehicle Incident Report</h1>
                  <p class="subtitle">Generated for manual campus follow-up and parking governance records.</p>
                </div>
              </div>
            </header>

            <section class="section">
              <p class="section-title">Incident Summary</p>
              <div class="grid">
                <div class="item">
                  <p class="item-label">Vehicle Plate</p>
                  <p class="item-value plate">${safePlate}</p>
                </div>
                <div class="item">
                  <p class="item-label">Report ID</p>
                  <p class="item-value">#${safeReportId}</p>
                </div>
                <div class="item">
                  <p class="item-label">Reported At</p>
                  <p class="item-value">${safeReportedAtText}</p>
                </div>
                <div class="item">
                  <p class="item-label">Location</p>
                  <p class="item-value">${safeLocation}</p>
                </div>
              </div>
            </section>

            <div class="banner">
              This vehicle is not registered in NIE Sync. Please proceed with campus-security workflow or a physical notice and keep this report for traceability.
            </div>

            <section class="actions">
              <h3>Recommended Follow-up</h3>
              <ul>
                <li>Verify the vehicle physically at the reported location.</li>
                <li>Place a notice requesting immediate vehicle movement.</li>
                <li>Escalate to campus security if obstruction persists.</li>
              </ul>
            </section>

            <footer class="footer">
              <p class="meta">Generated: ${safeGeneratedAtText}</p>
              <p class="meta">System: NIE Sync Parking Patrol</p>
              <div class="links">
                <a href="${escapePrintableHtml(faqUrl)}">FAQ</a>
                <span class="dot">•</span>
                <a href="${escapePrintableHtml(termsUrl)}">Terms of Service</a>
                <span class="dot">•</span>
                <a href="${escapePrintableHtml(privacyUrl)}">Privacy Policy</a>
              </div>
            </footer>
          </article>
        </div>
      </body>
    </html>
  `.trim();
}

function formatThreadParticipantTag(participant: ProfileIdentityRow) {
  const username = String(participant.username || "").trim();
  if (username) return `@${username}`;
  const firstName = String(participant.first_name || "").trim();
  const lastName = String(participant.last_name || "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName;
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
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelTargetReportId, setCancelTargetReportId] = useState("");
  const [isMarkingUnresolved, setIsMarkingUnresolved] = useState(false);
  const [isCallingOwner, setIsCallingOwner] = useState(false);
  const [revealedPhoneByReport, setRevealedPhoneByReport] = useState<Record<string, string>>(
    {}
  );
  const [reportPhotoUrlById, setReportPhotoUrlById] = useState<Record<string, string>>({});
  const [participantTagById, setParticipantTagById] = useState<Record<string, string>>({});
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const escalationSyncInFlightRef = useRef(false);
  const escalatedReportsRef = useRef<Set<string>>(new Set());

  const reportIdFromQuery = searchParams.get("report") || "";

  const loadReports = useCallback(async (viewerId: string, showLoader = false) => {
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
      if (current && rows.some((report) => report.id === current)) return current;
      if (reportIdFromQuery && rows.some((report) => report.id === reportIdFromQuery)) {
        return reportIdFromQuery;
      }
      return rows[0]?.id || "";
    });

    if (showLoader) {
      setIsLoadingReports(false);
    }
  }, [supabase, reportIdFromQuery]);

  useEffect(() => {
    if (reportIdFromQuery && reports.some(r => r.id === reportIdFromQuery)) {
      setSelectedReportId(reportIdFromQuery);
    }
  }, [reportIdFromQuery, reports]);

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

    const applySessionState = async (nextUserId: string, showLoader = false) => {
      if (!active) return;
      setUserId(nextUserId);
      setIsLoggedIn(Boolean(nextUserId));
      await loadReports(nextUserId, showLoader);
    };

    const bootstrap = async () => {
      try {
        const result = await supabase.auth.getSession();
        const session = result?.data?.session;
        const resolvedUserId = session?.user?.id || "";
        await applySessionState(resolvedUserId, true);
      } catch (error) {
        console.error("Parking patrol auth bootstrap failed:", error);
        await applySessionState("", true);
      }
    };

    void bootstrap();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const resolvedUserId = session?.user?.id || "";
      await applySessionState(resolvedUserId, false);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
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
    if (!isLoggedIn || !userId) return;
    const poll = window.setInterval(() => {
      void loadReports(userId, false);
    }, 2000);
    return () => window.clearInterval(poll);
  }, [isLoggedIn, userId, loadReports]);

  useEffect(() => {
    if (!selectedReportId) return;
    const poll = window.setInterval(() => {
      void loadMessages(selectedReportId);
    }, 2000);
    return () => window.clearInterval(poll);
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
          void loadReports(userId, false);
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
          void loadReports(userId, false);
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
  const chatElapsedSeconds = selectedReport
    ? getElapsedSeconds(selectedReport.created_at, synchronizedNowMs)
    : 0;
  const hasEmailSentAt = Boolean(String(selectedReport?.email_sent_at || "").trim());
  const acknowledgedState = selectedReport?.status === "acknowledged";
  const emailElapsedSeconds =
    selectedReport && hasEmailSentAt
      ? getElapsedSeconds(String(selectedReport.email_sent_at || ""), synchronizedNowMs)
      : 0;
  const callReady =
    Boolean(selectedReport) &&
    selectedReport?.status === "email_sent" &&
    hasEmailSentAt &&
    (Boolean(selectedReport?.phone_revealed) || emailElapsedSeconds >= EMAIL_TO_CALL_SECONDS);
  const stageCountdown = getStageCountdown(selectedReport, synchronizedNowMs);
  const stageLineFillPercent = !selectedReport
    ? 0
    : acknowledgedState
      ? hasEmailSentAt
        ? 50
        : 0
      : callReady
        ? 100
        : chatElapsedSeconds >= CHAT_WINDOW_SECONDS
          ? 50
          : 0;
  const circleRadius = 52;
  const circleLength = 2 * Math.PI * circleRadius;
  const circleOffset = circleLength * (1 - stageCountdown.progress);

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

    dueCandidates.forEach(c => escalatedReportsRef.current.add(c.id));
    void triggerEscalationSync();
  }, [isLoggedIn, reports, synchronizedNowMs, triggerEscalationSync, userId]);

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

  useEffect(() => {
    const reporterId = String(selectedReport?.reported_by || "");
    const ownerId = String(selectedReport?.matched_owner_id || "");
    const participantIds = Array.from(new Set([reporterId, ownerId].filter(Boolean)));
    if (participantIds.length === 0) return;

    let cancelled = false;

    const loadParticipantTags = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, first_name, last_name")
        .in("id", participantIds);

      if (cancelled || error) return;

      const tagMap: Record<string, string> = {};
      ((data || []) as ProfileIdentityRow[]).forEach((row) => {
        const tag = formatThreadParticipantTag(row);
        if (tag) {
          tagMap[row.id] = tag;
        }
      });

      setParticipantTagById((prev) => ({ ...prev, ...tagMap }));
    };

    void loadParticipantTags();

    return () => {
      cancelled = true;
    };
  }, [selectedReport?.id, selectedReport?.reported_by, selectedReport?.matched_owner_id, supabase]);

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

    if (locationValue.length > LOCATION_DESCRIPTION_MAX_LENGTH) {
      setSubmitError(`Location description must be ${LOCATION_DESCRIPTION_MAX_LENGTH} characters or less.`);
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

    if (userId) await loadReports(userId);
    if (result.reportId && !result.unmatched) {
      setSelectedReportId(result.reportId);
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          void triggerEscalationSync();
        }, 65000);
      }
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
    const appBaseUrl = window.location.origin.replace(/\/$/, "");
    const printable = buildUnmatchedReportHtml(unmatchedReport, appBaseUrl);

    const popup = window.open("", "_blank", "width=900,height=900");
    if (!popup) {
      setCopyDetailsMessage("Popup blocked. Allow popups to save as PDF.");
      return;
    }

    popup.document.write(printable);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => {
      popup.print();
    }, 350);
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
    if (userId) await loadReports(userId);
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

    if (userId) await loadReports(userId);
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

    if (userId) await loadReports(userId);
    await loadMessages(selectedReport.id);
  };

  const handleReporterCancel = async () => {
    if (!cancelTargetReportId) return;

    setIsCancelling(true);
    setThreadActionError("");

    const result = await reporterCancelReportAction(cancelTargetReportId);
    setIsCancelling(false);

    if (!result.ok) {
      setThreadActionError(result.error || "Unable to cancel this report.");
      return;
    }

    setCancelConfirmOpen(false);
    setCancelTargetReportId("");
    setThreadDraft("");
    if (userId) await loadReports(userId);
    setMessages([]);
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

    if (userId) await loadReports(userId);
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
    if (userId) await loadReports(userId);
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
      const label = getThreadRoleLabel(message, selectedReport, userId, participantTagById);
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
      <div className="mx-auto w-full max-w-[1200px] space-y-3">
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

        <section className="grid gap-3 lg:grid-cols-12 lg:items-start">
          <div className="space-y-3 lg:col-span-5">
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888]">Report Vehicle</p>
                <p className="mt-1 text-sm text-[#aaa]">Upload, auto-detect plate, and submit in one flow.</p>
              </div>
              <button
                type="button"
                onClick={() => setReportPanelOpen((current) => !current)}
                className="inline-flex h-12 w-full min-w-[140px] items-center justify-center gap-2 rounded-xl bg-[#f5a623] px-4 text-sm font-bold text-black transition-transform active:scale-95 sm:w-auto"
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
              <div className="mt-3 rounded-2xl border border-amber-400/35 bg-gradient-to-br from-amber-400/15 via-amber-500/5 to-sky-500/10 p-4 text-center shadow-[0_20px_45px_rgba(8,12,20,0.45)]">
                <p className="text-3xl">??</p>
                <p className="mt-2 text-base font-black tracking-tight text-white">Vehicle not registered in NIE Sync</p>
                <p className="mt-1 text-xs leading-relaxed text-[#bbb]">
                  Keep this report for records and use the branded PDF for campus-security follow-up.
                </p>
                <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-left">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#888]">Incident Snapshot</p>
                  <p className="mt-1 font-mono text-sm font-black tracking-wider text-[#f5a623]">{unmatchedReport.plate}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-[#aaa]">{unmatchedReport.location}</p>
                </div>
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
                    className="mt-2 w-full rounded-xl border border-white/[0.06] bg-[#111] p-4 text-center font-mono text-2xl font-black tracking-widest text-[#f5a623] outline-none placeholder:font-mono placeholder:text-base placeholder:font-bold placeholder:tracking-[0.12em] placeholder:text-[#666] focus:border-[#f5a623]/40"
                  />
                  <p className="mt-2 text-center text-xs text-[#666]">{getOwnerVehiclePlateFormatsHint()}</p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888]">Photo Upload (Optional)</p>
                  <p className="mt-1 text-xs text-[#666]">
                    Optional. Add a photo for OCR auto-detection and stronger incident context.
                  </p>
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
                        <p className="text-xs text-[#555]">Optional · photo will be compressed automatically</p>
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
                    <>
                      <textarea
                        value={locationInput}
                        onChange={(event) =>
                          setLocationInput(
                            String(event.target.value || "").slice(0, LOCATION_DESCRIPTION_MAX_LENGTH)
                          )
                        }
                        placeholder="Describe exact location"
                        rows={3}
                        maxLength={LOCATION_DESCRIPTION_MAX_LENGTH}
                        className="mt-2 w-full resize-none rounded-xl border border-white/[0.06] bg-[#111] p-3 text-sm text-white outline-none placeholder:text-[#444] focus:border-[#f5a623]/40"
                      />
                      <p className="mt-1 text-right text-[10px] text-[#666]">
                        {locationInput.length}/{LOCATION_DESCRIPTION_MAX_LENGTH}
                      </p>
                    </>
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
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-[#111] p-4 lg:col-span-7 lg:min-h-[900px]">
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
                    <div className="px-2 pb-4 sm:px-5">
                      <div className="relative flex items-start justify-between">
                        <div className="absolute left-3 right-3 top-3 h-[2px] rounded-full bg-white/10" />
                        <div
                          className="absolute left-3 top-3 h-[2px] rounded-full bg-gradient-to-r from-green-400 via-[#f5a623] to-[#ef4444] transition-all duration-500 ease-out"
                          style={{ width: `calc((100% - 24px) * ${Math.max(0, Math.min(100, stageLineFillPercent)) / 100})` }}
                        />
                        {["Chat", "Email", "Call"].map((label, index) => {
                          const node = index + 1;
                          const completed = acknowledgedState
                            ? node === 1 || (node === 2 && hasEmailSentAt)
                            : node === 1
                              ? chatElapsedSeconds >= CHAT_WINDOW_SECONDS
                              : node === 2
                                ? callReady
                                : false;
                          const active = acknowledgedState
                            ? false
                            : node === 1
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
                              <span className={`h-6 w-6 rounded-full border-2 shadow-[0_0_0_4px_#161616] transition-colors ${nodeClass}`} />
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

                    {isReporter && canCancelReport ? (
                      <button
                        type="button"
                        onClick={openCancelConfirmation}
                        disabled={isCancelling}
                        className="h-12 w-full rounded-xl border border-red-500/35 bg-red-500/10 text-sm font-bold text-red-300 transition-transform active:scale-95 disabled:opacity-60"
                      >
                        {isCancelling ? "Cancelling..." : "Cancel Report"}
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

                        const isOwnMessage = message.sender_id
                          ? message.sender_id === userId
                          : (isReporter && message.sender_role === "reporter") ||
                            (isOwner && message.sender_role === "owner");
                        return (
                          <div key={message.id} className={isOwnMessage ? "flex justify-end" : "flex justify-start"}>
                            <div className="max-w-[80%]">
                              <p className={`mb-1 text-[10px] text-[#555] ${isOwnMessage ? "text-right" : ""}`}>
                                {getThreadRoleLabel(message, selectedReport, userId, participantTagById)}
                              </p>
                              <div
                                className={`rounded-2xl px-4 py-2.5 text-sm ${
                                  isOwnMessage
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

          {cancelConfirmOpen ? (
            <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65 p-4 sm:items-center">
              <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#111] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888]">Cancel Report</p>
                <h3 className="mt-2 text-lg font-black tracking-tight text-white">
                  Cancel this incident report?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#aaa]">
                  This is allowed only during Stage 1 (first 1 minute). Once cancelled, this report
                  will be closed.
                </p>
                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={handleReporterCancel}
                    disabled={isCancelling}
                    className="h-12 w-full rounded-xl bg-[#ef4444] text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-60"
                  >
                    {isCancelling ? "Cancelling..." : "Yes, Cancel Report"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isCancelling) return;
                      setCancelConfirmOpen(false);
                      setCancelTargetReportId("");
                    }}
                    disabled={isCancelling}
                    className="h-12 w-full rounded-xl border border-white/10 bg-transparent text-sm font-bold text-[#aaa] transition-transform active:scale-95 disabled:opacity-60"
                  >
                    Keep Report Active
                  </button>
                </div>
              </div>
            </div>
          ) : null}
      </div>
    </main>
  );
}

export default function ParkingPatrolPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen w-full bg-[#0a0a0a] px-4 py-6 pb-20 pt-32 text-white">
          <div className="mx-auto w-full max-w-[1200px] animate-pulse space-y-3">
            <div className="h-40 rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
            <div className="grid gap-3 lg:grid-cols-12">
              <div className="space-y-3 lg:col-span-5">
                <div className="h-44 rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
                <div className="h-[28rem] rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
              </div>
              <div className="h-[52rem] rounded-2xl border border-white/[0.06] bg-white/[0.03] lg:col-span-7" />
            </div>
          </div>
        </main>
      }
    >
      <ParkingPatrolPageContent />
    </Suspense>
  );
}


