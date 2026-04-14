import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient as createServerClient } from "@/utils/supabase/server";
import nodemailer from "nodemailer";
import { existsSync } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* ── Brand palette (matches existing brand system) ── */
const BRAND = {
  campusBlack: [5, 5, 5] as const,
  navy: [10, 15, 36] as const,
  deepNavy: [6, 10, 28] as const,
  accentBlue: [37, 99, 235] as const,
  accentBlueDark: [29, 78, 186] as const,
  accentAmber: [255, 176, 0] as const,
  accentAmberDark: [204, 140, 0] as const,
  white: [255, 255, 255] as const,
  lightGray: [241, 245, 249] as const,
  midGray: [148, 163, 184] as const,
  slateText: [71, 85, 105] as const,
  ink: [17, 24, 39] as const,
  softBorder: [214, 223, 236] as const,
  cardBg: [248, 250, 255] as const,
  legalCardBg: [239, 246, 255] as const,
  emerald: [34, 197, 94] as const,
  emeraldDark: [22, 163, 74] as const,
  rose: [244, 63, 94] as const,
  cyan: [6, 182, 212] as const,
};

/* ── Utility helpers ── */

function toCompactDate(value?: string | null) {
  if (!value) return "Unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unavailable";
  return parsed.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toShortDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function normalizeStatus(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "UNKNOWN";
  return normalized.replace(/_/g, " ").toUpperCase();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ── PDF creation helpers ── */

async function createDoc() {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });
}

function ensurePageSpace(
  doc: any,
  y: number,
  requiredHeight: number,
  margin: number,
  pageHeight: number
) {
  if (y + requiredHeight <= pageHeight - 60) return y;
  doc.addPage();
  return margin + 8;
}

function drawDataExportHeader(
  doc: any,
  title: string,
  subtitle: string,
  userName: string,
  generatedAt: string,
  pdfLabel: string
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Background: dark navy header band
  const headerHeight = 130;
  doc.setFillColor(...BRAND.deepNavy);
  doc.rect(0, 0, pageWidth, headerHeight, "F");

  // Bottom accent stripe
  doc.setFillColor(...BRAND.accentBlue);
  doc.rect(0, headerHeight, pageWidth, 5, "F");

  // Top amber tag
  const tagText = "NIE CAMPUS SYNC";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const tagWidth = doc.getTextWidth(tagText) + 16;
  doc.setFillColor(...BRAND.accentAmber);
  doc.roundedRect(margin, 14, tagWidth, 16, 3, 3, "F");
  doc.setTextColor(10, 10, 10);
  doc.text(tagText, margin + 8, 25);

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(title, margin, 58);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(180, 195, 220);
  const subtitleLines = doc.splitTextToSize(subtitle, pageWidth - margin * 2 - 10);
  doc.text(subtitleLines, margin, 75);

  // PDF label badge (right side)
  const labelWidth = doc.getTextWidth(pdfLabel) + 18;
  doc.setFillColor(...BRAND.accentBlueDark);
  doc.roundedRect(pageWidth - margin - labelWidth, 14, labelWidth, 16, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(pdfLabel, pageWidth - margin - labelWidth + 9, 25);

  // Bottom metadata row
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(140, 160, 190);
  doc.text(`Prepared for: ${userName}`, margin, headerHeight - 18);
  doc.text(`Generated: ${toCompactDate(generatedAt)}`, margin + 260, headerHeight - 18);

  // Separator
  doc.setDrawColor(60, 80, 120);
  doc.setLineWidth(0.4);
  doc.line(margin, headerHeight - 6, pageWidth - margin, headerHeight - 6);

  return headerHeight + 5 + 22;
}

function drawSectionHeading(
  doc: any,
  title: string,
  y: number,
  margin: number,
  width: number
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.slateText);
  doc.text(title.toUpperCase(), margin, y);
  doc.setDrawColor(...BRAND.softBorder);
  doc.setLineWidth(0.7);
  doc.line(margin, y + 5, margin + width, y + 5);
  return y + 20;
}

function drawFieldCard(
  doc: any,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string
) {
  doc.setFillColor(...BRAND.cardBg);
  doc.setDrawColor(...BRAND.softBorder);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, w, h, 6, 6, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.accentBlue);
  doc.text(label.toUpperCase(), x + 10, y + 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.ink);
  const wrapped = doc.splitTextToSize(value, w - 20);
  doc.text(wrapped, x + 10, y + 32);
}

function drawFooter(doc: any, pageNumber: number, totalPages: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  // Separator
  doc.setDrawColor(...BRAND.softBorder);
  doc.setLineWidth(0.5);
  doc.line(margin, pageHeight - 44, pageWidth - margin, pageHeight - 44);

  // Left text
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.midGray);
  doc.text(
    "NIE Sync  ·  Personal Data Export  ·  Confidential",
    margin,
    pageHeight - 30
  );

  // Page number
  doc.setTextColor(...BRAND.slateText);
  doc.text(
    `Page ${pageNumber} of ${totalPages}`,
    pageWidth - 82,
    pageHeight - 30
  );
}

function addFootersToAllPages(doc: any) {
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(doc, page, totalPages);
  }
}

function drawLegalFooterCard(
  doc: any,
  y: number,
  margin: number,
  contentWidth: number,
  pageHeight: number
) {
  const lines = [
    "This document contains personal data exported under GDPR/IT Act compliance.",
    "Handle with care — do not share with unauthorized individuals.",
    "If you did not request this export, visit niesync.vercel.app/contact immediately.",
    "Do not reply to the email this document was attached to — it is a no-reply address.",
  ];

  const rows = lines.map((line) => doc.splitTextToSize(line, contentWidth - 34));
  const contentLineCount = rows.reduce(
    (sum: number, row: string[]) => sum + row.length,
    0
  );
  const height = 24 + 14 + contentLineCount * 12 + rows.length * 4 + 14;

  y = ensurePageSpace(doc, y, height + 6, margin, pageHeight);

  doc.setDrawColor(...BRAND.softBorder);
  doc.setLineWidth(0.5);
  doc.setFillColor(...BRAND.legalCardBg);
  doc.roundedRect(margin, y, contentWidth, height, 8, 8, "FD");

  // Title band
  doc.setFillColor(...BRAND.accentBlueDark);
  doc.roundedRect(margin, y, contentWidth, 22, 8, 8, "F");
  doc.rect(margin, y + 11, contentWidth, 11, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text("DATA PROTECTION NOTICE", margin + 12, y + 15);

  // Content
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.slateText);

  let lineY = y + 38;
  rows.forEach((wrapped: string[]) => {
    doc.setFillColor(...BRAND.accentBlue);
    doc.circle(margin + 16, lineY - 3, 2, "F");
    doc.text(wrapped, margin + 24, lineY);
    lineY += wrapped.length * 12 + 4;
  });

  return y + height + 14;
}

/* ── TABLE DRAWER ── */

function drawTable(
  doc: any,
  y: number,
  margin: number,
  contentWidth: number,
  pageHeight: number,
  headers: string[],
  rows: string[][],
  colWidths: number[]
) {
  const rowHeight = 24;
  const headerHeight = 28;
  const fontSize = 8;
  const headerFontSize = 7.5;
  const cellPadding = 6;

  // Header
  y = ensurePageSpace(doc, y, headerHeight + rowHeight * 2, margin, pageHeight);

  doc.setFillColor(...BRAND.deepNavy);
  doc.roundedRect(margin, y, contentWidth, headerHeight, 4, 4, "F");
  doc.rect(margin, y + 4, contentWidth, headerHeight - 4, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(headerFontSize);
  doc.setTextColor(255, 255, 255);

  let headerX = margin + cellPadding;
  headers.forEach((header, i) => {
    doc.text(header.toUpperCase(), headerX, y + 18);
    headerX += colWidths[i];
  });

  y += headerHeight;

  // Rows
  rows.forEach((row, rowIndex) => {
    y = ensurePageSpace(doc, y, rowHeight + 4, margin, pageHeight);

    const isEven = rowIndex % 2 === 0;
    if (isEven) {
      doc.setFillColor(248, 250, 255);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(margin, y, contentWidth, rowHeight, "F");

    // Light border bottom
    doc.setDrawColor(230, 235, 245);
    doc.setLineWidth(0.3);
    doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(...BRAND.ink);

    let cellX = margin + cellPadding;
    row.forEach((cell, i) => {
      const maxCellWidth = colWidths[i] - cellPadding * 2;
      const truncated =
        doc.getTextWidth(cell) > maxCellWidth
          ? cell.slice(0, Math.floor(maxCellWidth / 4)) + "…"
          : cell;
      doc.text(truncated, cellX, y + 16);
      cellX += colWidths[i];
    });

    y += rowHeight;
  });

  return y + 8;
}

/* ═══════════════════════════════════════════════════════
   PDF 1: Profile Summary & Parking Reports
   ═══════════════════════════════════════════════════════ */

async function generateProfileSummaryPdf(
  profileData: any,
  parkingReports: any[],
  authUser: any,
  generatedAt: string
) {
  const doc = await createDoc();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  const userName = [
    String(profileData?.first_name || ""),
    String(profileData?.last_name || ""),
  ]
    .join(" ")
    .trim() || "User";

  /* ── Page 1: Profile Summary ── */
  let y = drawDataExportHeader(
    doc,
    "Personal Data Export",
    "Complete profile and activity summary prepared upon your request. This document is confidential.",
    userName,
    generatedAt,
    "PDF 1 OF 3"
  );

  y = drawSectionHeading(doc, "Profile Summary", y, margin, contentWidth);

  const fieldGap = 12;
  const colWidth = (contentWidth - fieldGap) / 2;

  const fields = [
    ["Full Name", userName],
    ["USN", String(profileData?.usn || "-")],
    ["Branch", String(profileData?.batch || "-")],
    ["Year", String(profileData?.year_of_study || "-")],
    [
      "Member Since",
      toShortDate(authUser?.created_at || profileData?.created_at),
    ],
    ["Total Reports", String(parkingReports.length)],
    ["Email", String(authUser?.email || "-")],
    ["Role", String(profileData?.role || "-")],
  ];

  for (let i = 0; i < fields.length; i += 2) {
    const leftField = fields[i];
    const rightField = fields[i + 1];

    const cardH = 52;
    y = ensurePageSpace(doc, y, cardH + 12, margin, pageHeight);

    drawFieldCard(doc, margin, y, colWidth, cardH, leftField[0], leftField[1]);
    if (rightField) {
      drawFieldCard(
        doc,
        margin + colWidth + fieldGap,
        y,
        colWidth,
        cardH,
        rightField[0],
        rightField[1]
      );
    }
    y += cardH + 10;
  }

  /* ── Page 2: Parking Reports ── */
  doc.addPage();
  y = margin + 8;

  y = drawSectionHeading(doc, "Parking Reports", y, margin, contentWidth);

  if (parkingReports.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.slateText);
    doc.text("No parking reports found for your account.", margin, y + 2);
    y += 24;
  } else {
    const headers = ["Date", "Location", "Plate", "Status", "Match Found"];
    const colWidths = [
      contentWidth * 0.18,
      contentWidth * 0.3,
      contentWidth * 0.18,
      contentWidth * 0.18,
      contentWidth * 0.16,
    ];

    const tableRows = parkingReports.map((report) => [
      toShortDate(report.created_at),
      String(report.location_description || "-").slice(0, 40),
      String(report.license_plate || "-"),
      normalizeStatus(report.status),
      report.matched_owner_id ? "Yes" : "No",
    ]);

    y = drawTable(
      doc,
      y,
      margin,
      contentWidth,
      pageHeight,
      headers,
      tableRows,
      colWidths
    );
  }

  /* ── Page 3: Lost & Found (Coming Soon) ── */
  doc.addPage();
  y = margin + 8;

  y = drawSectionHeading(
    doc,
    "Lost & Found Activity",
    y,
    margin,
    contentWidth
  );

  // Coming soon card
  const comingSoonH = 120;
  y = ensurePageSpace(doc, y, comingSoonH + 20, margin, pageHeight);

  doc.setFillColor(...BRAND.cardBg);
  doc.setDrawColor(...BRAND.softBorder);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, y, contentWidth, comingSoonH, 10, 10, "FD");

  // Accent bar
  doc.setFillColor(...BRAND.accentAmber);
  doc.roundedRect(margin, y, contentWidth, 4, 10, 10, "F");
  doc.rect(margin, y + 2, contentWidth, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...BRAND.ink);
  doc.text("Coming Soon", margin + contentWidth / 2 - 48, y + 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.slateText);
  const comingSoonNote = doc.splitTextToSize(
    "Lost & Found module data export will be available in a future update. Your lost & found reports, items, and activity logs will be included here.",
    contentWidth - 60
  );
  doc.text(comingSoonNote, margin + 30, y + 72);

  y += comingSoonH + 16;

  // Legal notice
  y = drawLegalFooterCard(doc, y, margin, contentWidth, pageHeight);

  addFootersToAllPages(doc);

  return Buffer.from(doc.output("arraybuffer"));
}

/* ═══════════════════════════════════════════════════════
   PDF 2: Chat Transcripts
   ═══════════════════════════════════════════════════════ */

async function generateTranscriptsPdf(
  parkingReports: any[],
  messagesByReport: Record<string, any[]>,
  userName: string,
  userId: string,
  generatedAt: string
) {
  const doc = await createDoc();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  let y = drawDataExportHeader(
    doc,
    "Chat Transcript Archive",
    "Complete conversation logs from all your parking incident reports, exported for your records.",
    userName,
    generatedAt,
    "PDF 2 OF 3"
  );

  if (parkingReports.length === 0) {
    y = drawSectionHeading(doc, "Transcripts", y, margin, contentWidth);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.slateText);
    doc.text("No reports or chat history found.", margin, y + 2);
  } else {
    for (let r = 0; r < parkingReports.length; r++) {
      const report = parkingReports[r];
      const messages = messagesByReport[report.id] || [];
      const shortId = String(report.id || "").slice(0, 8).toUpperCase();

      if (r > 0) {
        doc.addPage();
        y = margin + 8;
      }

      // Report header
      y = drawSectionHeading(
        doc,
        `Report #${shortId} — ${String(report.license_plate || "UNKNOWN")}`,
        y,
        margin,
        contentWidth
      );

      // Small metadata
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...BRAND.slateText);
      doc.text(
        `Location: ${String(report.location_description || "-").slice(0, 80)}   |   Status: ${normalizeStatus(report.status)}   |   Date: ${toShortDate(report.created_at)}`,
        margin,
        y
      );
      y += 18;

      if (messages.length === 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...BRAND.midGray);
        doc.text("No chat messages recorded for this report.", margin, y);
        y += 20;
        continue;
      }

      // Draw messages as styled blocks
      for (const msg of messages) {
        const isSystem = msg.sender_role === "system";
        const isOwner = msg.sender_role === "owner";
        const isReporter = msg.sender_role === "reporter";

        let roleLabel = "SYSTEM";
        if (isOwner) {
          roleLabel =
            msg.sender_id === userId ? "YOU (OWNER)" : "VEHICLE OWNER";
        } else if (isReporter) {
          roleLabel = msg.sender_id === userId ? "YOU (REPORTER)" : "REPORTER";
        }

        const timestamp = toCompactDate(msg.created_at);
        const actorLine = `${roleLabel}  ·  ${timestamp}`;
        const messageText = String(msg.message || "-");
        const messageLines = doc.splitTextToSize(messageText, contentWidth - 28);

        const bubbleHeight = 16 + 12 + 6 + messageLines.length * 12 + 12;
        y = ensurePageSpace(doc, y, bubbleHeight + 6, margin, pageHeight);

        // Bubble background
        const bubbleFill = isSystem
          ? [238, 242, 248]
          : isOwner
            ? [255, 251, 240]
            : [248, 250, 255];
        doc.setFillColor(bubbleFill[0], bubbleFill[1], bubbleFill[2]);
        doc.setDrawColor(...BRAND.softBorder);
        doc.setLineWidth(0.5);
        doc.roundedRect(margin, y, contentWidth, bubbleHeight, 8, 8, "FD");

        // Accent left border
        const accentColor = isSystem
          ? BRAND.midGray
          : isOwner
            ? BRAND.accentAmber
            : BRAND.accentBlue;
        doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.rect(margin, y + 6, 3, bubbleHeight - 12, "F");

        // Actor
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(
          isSystem
            ? BRAND.slateText[0]
            : isOwner
              ? BRAND.accentAmberDark[0]
              : BRAND.accentBlueDark[0],
          isSystem
            ? BRAND.slateText[1]
            : isOwner
              ? BRAND.accentAmberDark[1]
              : BRAND.accentBlueDark[1],
          isSystem
            ? BRAND.slateText[2]
            : isOwner
              ? BRAND.accentAmberDark[2]
              : BRAND.accentBlueDark[2]
        );
        doc.text(actorLine, margin + 14, y + 16);

        // Message
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...BRAND.ink);
        doc.text(messageLines, margin + 14, y + 34);

        y += bubbleHeight + 6;
      }
    }
  }

  // Legal
  y += 6;
  y = drawLegalFooterCard(doc, y, margin, contentWidth, pageHeight);

  addFootersToAllPages(doc);

  return Buffer.from(doc.output("arraybuffer"));
}

/* ═══════════════════════════════════════════════════════
   PDF 3: Auth History
   ═══════════════════════════════════════════════════════ */

async function generateAuthHistoryPdf(
  sessions: any[],
  authUser: any,
  userName: string,
  generatedAt: string
) {
  const doc = await createDoc();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  let y = drawDataExportHeader(
    doc,
    "Authentication History",
    "Complete login and session history for your NIE Sync account. Includes all active and expired sessions.",
    userName,
    generatedAt,
    "PDF 3 OF 3"
  );

  // Account info
  y = drawSectionHeading(doc, "Account Overview", y, margin, contentWidth);

  const fieldGap = 12;
  const colWidth = (contentWidth - fieldGap) / 2;

  const overviewFields = [
    ["Account ID", String(authUser?.id || "-").slice(0, 16) + "…"],
    ["Email", String(authUser?.email || "-")],
    ["Account Created", toCompactDate(authUser?.created_at)],
    ["Last Sign-In", toCompactDate(authUser?.last_sign_in_at)],
    [
      "Auth Provider",
      String(
        Array.isArray(authUser?.app_metadata?.providers)
          ? authUser.app_metadata.providers.join(", ")
          : authUser?.app_metadata?.provider || "-"
      ),
    ],
    ["Total Sessions", String(sessions.length)],
  ];

  for (let i = 0; i < overviewFields.length; i += 2) {
    const left = overviewFields[i];
    const right = overviewFields[i + 1];

    const cardH = 52;
    y = ensurePageSpace(doc, y, cardH + 12, margin, pageHeight);

    drawFieldCard(doc, margin, y, colWidth, cardH, left[0], left[1]);
    if (right) {
      drawFieldCard(
        doc,
        margin + colWidth + fieldGap,
        y,
        colWidth,
        cardH,
        right[0],
        right[1]
      );
    }
    y += cardH + 10;
  }

  // Session history table
  y += 4;
  y = drawSectionHeading(
    doc,
    "Session History (All Records)",
    y,
    margin,
    contentWidth
  );

  if (sessions.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.slateText);
    doc.text("No session records found.", margin, y + 2);
    y += 24;
  } else {
    const headers = [
      "Device / Browser",
      "IP Address",
      "Location",
      "Last Active",
      "Status",
    ];
    const colWidths = [
      contentWidth * 0.28,
      contentWidth * 0.17,
      contentWidth * 0.2,
      contentWidth * 0.2,
      contentWidth * 0.15,
    ];

    const getBrowserOs = (ua: string) => {
      const raw = String(ua || "");
      let browser = "Browser";
      if (/Edg\//i.test(raw)) browser = "Edge";
      else if (/OPR\//i.test(raw)) browser = "Opera";
      else if (/Chrome\//i.test(raw)) browser = "Chrome";
      else if (/Safari\//i.test(raw) && !/Chrome\//i.test(raw))
        browser = "Safari";
      else if (/Firefox\//i.test(raw)) browser = "Firefox";

      let os = "Unknown";
      if (/Mac|Macintosh/i.test(raw)) os = "macOS";
      else if (/Windows/i.test(raw)) os = "Windows";
      else if (/Android/i.test(raw)) os = "Android";
      else if (/iPhone|iPad/i.test(raw)) os = "iOS";
      else if (/Linux/i.test(raw)) os = "Linux";

      return `${browser} / ${os}`;
    };

    const tableRows = sessions.map((session) => [
      getBrowserOs(session.user_agent),
      String(session.ip_address || "-"),
      String(session.location_label || "-"),
      toCompactDate(session.last_seen_at),
      session.revoked_at ? "Ended" : "Active",
    ]);

    y = drawTable(
      doc,
      y,
      margin,
      contentWidth,
      pageHeight,
      headers,
      tableRows,
      colWidths
    );
  }

  // Detailed session cards for recent ones
  const recentSessions = sessions.slice(0, 10);
  if (recentSessions.length > 0) {
    y += 4;
    y = ensurePageSpace(doc, y, 80, margin, pageHeight);
    y = drawSectionHeading(
      doc,
      "Recent Sessions — Detailed View",
      y,
      margin,
      contentWidth
    );

    for (const session of recentSessions) {
      const cardH = 68;
      y = ensurePageSpace(doc, y, cardH + 12, margin, pageHeight);

      const isActive = !session.revoked_at;

      doc.setFillColor(...BRAND.cardBg);
      doc.setDrawColor(
        isActive ? BRAND.emerald[0] : BRAND.softBorder[0],
        isActive ? BRAND.emerald[1] : BRAND.softBorder[1],
        isActive ? BRAND.emerald[2] : BRAND.softBorder[2]
      );
      doc.setLineWidth(isActive ? 1 : 0.5);
      doc.roundedRect(margin, y, contentWidth, cardH, 8, 8, "FD");

      // Status dot
      doc.setFillColor(
        isActive ? BRAND.emerald[0] : BRAND.rose[0],
        isActive ? BRAND.emerald[1] : BRAND.rose[1],
        isActive ? BRAND.emerald[2] : BRAND.rose[2]
      );
      doc.circle(margin + 16, y + 18, 4, "F");

      // Device
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...BRAND.ink);
      doc.text(
        String(session.user_agent || "Unknown Device").slice(0, 70),
        margin + 28,
        y + 20
      );

      // Details row
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...BRAND.slateText);
      doc.text(
        `IP: ${String(session.ip_address || "-")}   |   Location: ${String(session.location_label || "-")}`,
        margin + 28,
        y + 36
      );
      doc.text(
        `First seen: ${toCompactDate(session.created_at)}   |   Last active: ${toCompactDate(session.last_seen_at)}${session.revoked_at ? `   |   Ended: ${toCompactDate(session.revoked_at)}` : ""}`,
        margin + 28,
        y + 50
      );

      // Status badge
      const badgeText = isActive ? "ACTIVE" : "ENDED";
      const badgeW = doc.getTextWidth(badgeText) + 14;
      doc.setFillColor(
        isActive ? BRAND.emerald[0] : BRAND.midGray[0],
        isActive ? BRAND.emerald[1] : BRAND.midGray[1],
        isActive ? BRAND.emerald[2] : BRAND.midGray[2]
      );
      doc.roundedRect(
        pageWidth - margin - badgeW - 8,
        y + 10,
        badgeW,
        18,
        9,
        9,
        "F"
      );
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text(badgeText, pageWidth - margin - badgeW - 1, y + 22);

      y += cardH + 8;
    }
  }

  // Legal
  y += 4;
  y = drawLegalFooterCard(doc, y, margin, contentWidth, pageHeight);

  addFootersToAllPages(doc);

  return Buffer.from(doc.output("arraybuffer"));
}

/* ═══════════════════════════════════════════════════════
   EMAIL TEMPLATE
   ═══════════════════════════════════════════════════════ */

function buildDataExportEmailHtml(
  userName: string,
  hasLogo: boolean
): string {
  const logoMarkup = hasLogo
    ? `<img src="cid:nie-sync-logo" width="56" height="56" alt="NIE Sync" style="display:block;width:56px;height:56px;border-radius:12px;border:0;outline:none;text-decoration:none;" />`
    : `<img src="https://niesync.vercel.app/logo.png" width="56" height="56" alt="NIE Sync" style="display:block;width:56px;height:56px;border-radius:12px;border:0;outline:none;text-decoration:none;" />`;

  const safeName = escapeHtml(userName);
  const currentYear = new Date().getFullYear();

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>
          @media (prefers-color-scheme: dark) {
            .email-bg { background:#020202 !important; }
            .email-card { background:#0a0a0a !important; border-color:#2a2a2a !important; }
            .soft-panel { background:#111111 !important; border-color:#2a2a2a !important; }
            .title, .body-text { color:#f5f5f5 !important; }
            .muted { color:#b6b6bc !important; }
          }
        </style>
      </head>
      <body class="email-bg" style="margin:0;padding:0;background:#f4f6fb;font-family:'Rubik','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;">
          <tr>
            <td align="center">
              <table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dbe1ec;border-radius:18px;overflow:hidden;">
                
                <!-- Header -->
                <tr>
                  <td style="padding:28px 28px 18px;background:#050505;">
                    <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                      <tr>
                        <td style="width:64px;vertical-align:top;">
                          ${logoMarkup}
                        </td>
                        <td style="vertical-align:middle;">
                          <p style="margin:0;font-size:11px;line-height:1.4;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#FFB000;">NIE Sync</p>
                          <p style="margin:6px 0 0;font-size:17px;line-height:1.35;font-weight:800;color:#ffffff;">Your Data Export is Ready</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:24px 28px 10px;">
                    <h1 class="title" style="margin:0;font-size:22px;line-height:1.3;font-weight:800;color:#111827;">Hi ${safeName},</h1>
                    <p class="body-text" style="margin:14px 0 0;font-size:15px;line-height:1.7;color:#1f2937;">
                      We've prepared a copy of your personal data from NIE Sync. Attached to this email you'll find <strong>3 PDF documents</strong> containing:
                    </p>
                  </td>
                </tr>

                <!-- PDF List -->
                <tr>
                  <td style="padding:8px 28px;">
                    <table class="soft-panel" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e5eaf3;border-radius:12px;">
                      <tr>
                        <td style="padding:14px 16px;border-bottom:1px solid #e5eaf3;">
                          <p style="margin:0;font-size:13px;line-height:1.6;font-weight:700;color:#111827;">
                            📋 <strong>Profile & Activity Summary</strong>
                          </p>
                          <p class="muted" style="margin:4px 0 0;font-size:12px;line-height:1.5;color:#586274;">Your profile data, parking reports table, and lost & found status.</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:14px 16px;border-bottom:1px solid #e5eaf3;">
                          <p style="margin:0;font-size:13px;line-height:1.6;font-weight:700;color:#111827;">
                            💬 <strong>Chat Transcripts</strong>
                          </p>
                          <p class="muted" style="margin:4px 0 0;font-size:12px;line-height:1.5;color:#586274;">Complete conversation logs from every parking incident report.</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:14px 16px;">
                          <p style="margin:0;font-size:13px;line-height:1.6;font-weight:700;color:#111827;">
                            🔐 <strong>Authentication History</strong>
                          </p>
                          <p class="muted" style="margin:4px 0 0;font-size:12px;line-height:1.5;color:#586274;">All login sessions, devices, IP addresses, and session activity.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Info note -->
                <tr>
                  <td style="padding:16px 28px;">
                    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;">
                      <p style="margin:0;font-size:12px;line-height:1.6;color:#1e40af;font-weight:600;">
                        🛡️ <strong>Data Protection Notice</strong>
                      </p>
                      <p style="margin:6px 0 0;font-size:12px;line-height:1.65;color:#1e40af;">
                        These documents contain personal information. Keep them secure and do not share with unauthorized individuals. If you didn't request this export, <a href="https://niesync.vercel.app/contact" style="color:#1e40af;font-weight:700;text-decoration:underline;">contact us immediately</a>.
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:14px 28px 28px;">
                    <p class="muted" style="margin:0;font-size:12px;line-height:1.65;color:#5b6473;">
                      This data was generated automatically by NIE Sync in response to your download request.
                    </p>
                    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;margin-top:14px;">
                      <p style="margin:0;font-size:12px;line-height:1.6;color:#991b1b;font-weight:700;">
                        ⛔ This is an automated, no-reply email. Please do not reply to this message.
                      </p>
                      <p style="margin:4px 0 0;font-size:11px;line-height:1.6;color:#991b1b;">
                        If you need help or didn't request this export, please <a href="https://niesync.vercel.app/contact" style="color:#2563EB;text-decoration:none;font-weight:600;">contact us here</a>.
                      </p>
                    </div>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-top:1px solid #e5eaf3;">
                      <tr>
                        <td style="padding-top:12px;">
                          <p class="muted" style="margin:0;font-size:11px;line-height:1.7;color:#7b8494;">
                            Need help?
                            <a href="https://niesync.vercel.app/faq" style="color:#2563EB;text-decoration:none;font-weight:600;">FAQ</a>
                            &nbsp;·&nbsp;
                            <a href="https://niesync.vercel.app/contact" style="color:#2563EB;text-decoration:none;font-weight:600;">Contact Support</a>
                          </p>
                          <p class="muted" style="margin:6px 0 0;font-size:11px;line-height:1.7;color:#7b8494;">
                            © ${currentYear} NIE Campus Sync. All rights reserved.
                          </p>
                          <p style="margin:6px 0 0;font-size:11px;line-height:1.7;">
                            <a href="https://niesync.vercel.app/terms-of-service" style="color:#2563EB;text-decoration:none;">Terms of Service</a>
                            <span class="muted" style="color:#9ca3af;"> · </span>
                            <a href="https://niesync.vercel.app/privacy-policy" style="color:#2563EB;text-decoration:none;">Privacy Policy</a>
                          </p>
                          <p class="muted" style="margin:10px 0 0;font-size:10px;line-height:1.5;color:#9ca3af;">
                            NIE Sync · The National Institute of Engineering, Mysuru, Karnataka, India
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `.trim();
}

// ══════════════════════════════════════════════════════
//   MAILER
// ======================================================

function getDataExportTransporter() {
  const smtpUser = String(process.env.GMAIL_USER || "").trim();
  const smtpPassword = String(process.env.GMAIL_APP_PASSWORD || "").trim();

  if (!smtpUser || !smtpPassword) {
    throw new Error("SMTP configuration missing.");
  }

  const emailDomain = smtpUser.split("@")[1]?.toLowerCase() || "";
  const isZoho =
    emailDomain === "zoho.com" ||
    emailDomain === "zohomail.com" ||
    emailDomain === "zoho.in" ||
    emailDomain === "zohomail.in";

  if (isZoho) {
    const host = emailDomain.endsWith(".in") ? "smtp.zoho.in" : "smtp.zoho.com";
    return nodemailer.createTransport({
      host,
      port: 465,
      secure: true,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate the user via session cookies
    const supabaseServer = await createServerClient();
    const { data: userData, error: userError } =
      await supabaseServer.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const authUser = userData.user;
    const userId = authUser.id;
    const userEmail = String(authUser.email || "").trim();

    if (!userEmail) {
      return NextResponse.json(
        { error: "No email found for your account." },
        { status: 400 }
      );
    }

    // Kick off the heavy work (data fetch → PDF gen → 1-min wait → email)
    // as a detached background task so we can respond to the client immediately.
    after(async () => {
      await processAndSendExport({ authUser, userId, userEmail });
    });

    // Respond immediately — user doesn't wait
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Data export error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process data export.",
      },
      { status: 500 }
    );
  }
}

async function processAndSendExport({
  authUser,
  userId,
  userEmail,
}: {
  authUser: any;
  userId: string;
  userEmail: string;
}) {
  try {
    // Use admin client to read all data
    const admin = createAdminClient();

    // Fetch all data in parallel
    const [profileResult, reportsResult, sessionsResult] = await Promise.all([
      admin
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle(),
      admin
        .from("parking_reports")
        .select(
          "id, reported_by, license_plate, location_description, matched_owner_id, status, resolved_at, created_at"
        )
        .or(`reported_by.eq.${userId},matched_owner_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("auth_session_devices")
        .select(
          "id, session_id, user_agent, ip_address, location_label, created_at, last_seen_at, revoked_at"
        )
        .eq("user_id", userId)
        .order("last_seen_at", { ascending: false })
        .limit(200),
    ]);

    const profileData = profileResult.data || {};
    const parkingReports = (reportsResult.data || []) as any[];
    const sessions = (sessionsResult.data || []) as any[];

    // Fetch all messages for all reports
    const reportIds = parkingReports.map((r) => r.id);
    let allMessages: any[] = [];

    if (reportIds.length > 0) {
      const { data: messagesData } = await admin
        .from("parking_report_messages")
        .select(
          "id, report_id, sender_id, sender_role, message, created_at"
        )
        .in("report_id", reportIds)
        .order("created_at", { ascending: true })
        .limit(2000);

      allMessages = (messagesData || []) as any[];
    }

    // Group messages by report
    const messagesByReport: Record<string, any[]> = {};
    allMessages.forEach((msg) => {
      const reportId = String(msg.report_id || "");
      if (!messagesByReport[reportId]) {
        messagesByReport[reportId] = [];
      }
      messagesByReport[reportId].push(msg);
    });

    const userName = [
      String(profileData?.first_name || ""),
      String(profileData?.last_name || ""),
    ]
      .join(" ")
      .trim() || "User";
    const generatedAt = new Date().toISOString();

    // Generate all 3 PDFs
    const [pdf1Buffer, pdf2Buffer, pdf3Buffer] = await Promise.all([
      generateProfileSummaryPdf(profileData, parkingReports, authUser, generatedAt),
      generateTranscriptsPdf(
        parkingReports,
        messagesByReport,
        userName,
        userId,
        generatedAt
      ),
      generateAuthHistoryPdf(sessions, authUser, userName, generatedAt),
    ]);

    // Wait 1 minute before sending the email
    // No artificial delay — send immediately

    // Prepare email
    const transporter = getDataExportTransporter();
    const smtpUser = String(process.env.GMAIL_USER || "").trim();

    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const hasLogo = existsSync(logoPath);

    const attachments: any[] = [
      {
        filename: `NIE-Sync-Profile-Summary-${new Date().toISOString().slice(0, 10)}.pdf`,
        content: pdf1Buffer,
        contentType: "application/pdf",
      },
      {
        filename: `NIE-Sync-Chat-Transcripts-${new Date().toISOString().slice(0, 10)}.pdf`,
        content: pdf2Buffer,
        contentType: "application/pdf",
      },
      {
        filename: `NIE-Sync-Auth-History-${new Date().toISOString().slice(0, 10)}.pdf`,
        content: pdf3Buffer,
        contentType: "application/pdf",
      },
    ];

    if (hasLogo) {
      attachments.push({
        filename: "nie-sync-logo.png",
        path: logoPath,
        cid: "nie-sync-logo",
      });
    }

    const emailHtml = buildDataExportEmailHtml(userName, hasLogo);

    await transporter.sendMail({
      from: `NIE Campus Sync <${smtpUser}>`,
      to: userEmail,
      subject: `NIE Sync — Your Personal Data Export is Ready`,
      html: emailHtml,
      attachments,
    });
  } catch (bgError) {
    console.error("Background data export failed:", bgError);
  }
}
