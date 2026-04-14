type ParkingReportPdfBaseInput = {
  reportId: string;
  plate: string;
  location: string;
  status: string;
  createdAtIso: string;
  resolvedAtIso?: string | null;
  generatedAtIso?: string;
  incidentPhotoUrl?: string | null;
};

export type ParkingIncidentReportPdfInput = ParkingReportPdfBaseInput & {
  reporterNote?: string | null;
};

export type ParkingTranscriptPdfInput = ParkingReportPdfBaseInput & {
  transcriptLines: string[];
};

type PdfResult = {
  ok: boolean;
  error?: string;
};

/* ── Brand palette (matches tailwind config + extended PDF palette) ── */
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

function safeOrigin() {
  if (typeof window === "undefined") return "";
  return String(window.location.origin || "").replace(/\/$/, "");
}

function toShortReportId(reportId: string) {
  return String(reportId || "").slice(0, 8).toUpperCase() || "UNKNOWN";
}

async function computeEvidenceFingerprint(payload: string) {
  try {
    if (typeof window === "undefined" || !window.crypto?.subtle) return "UNAVAILABLE";
    const encoded = new TextEncoder().encode(payload);
    const digest = await window.crypto.subtle.digest("SHA-256", encoded);
    const hash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    return hash.slice(0, 40);
  } catch {
    return "UNAVAILABLE";
  }
}

function normalizeFilePlate(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
}

function toDisplayDate(value?: string | null) {
  if (!value) return "Unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unavailable";
  return parsed.toLocaleString();
}

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

function normalizeStatus(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "UNKNOWN";
  return normalized.replace(/_/g, " ").toUpperCase();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(blob);
  });
}

async function urlToDataUrl(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Image fetch failed with status ${response.status}.`);
  }
  const blob = await response.blob();
  return blobToDataUrl(blob);
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.width, height: image.height });
    image.onerror = () => reject(new Error("Unable to decode image."));
    image.src = dataUrl;
  });
}

function parseTranscriptLine(line: string) {
  const trimmed = String(line || "").trim();
  const match = trimmed.match(/^\[(.*?)\]\s*([^:]+):\s*(.*)$/);
  if (!match) {
    return {
      timestamp: "",
      actor: "EVENT",
      message: trimmed,
    };
  }

  return {
    timestamp: String(match[1] || "").trim(),
    actor: String(match[2] || "").trim() || "EVENT",
    message: String(match[3] || "").trim(),
  };
}

async function resolveLogoDataUrl() {
  try {
    const origin = safeOrigin();
    const logoUrl = origin ? `${origin}/logo.png` : "/logo.png";
    return await urlToDataUrl(logoUrl);
  } catch {
    return "";
  }
}

/* ── Document helpers ── */

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

/* ── Header (completely restructured — no overlaps) ── */

function drawHeader(
  doc: any,
  title: string,
  subtitle: string,
  logoDataUrl: string,
  metadata?: { reportId?: string; status?: string; generatedAt?: string }
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // ── Background: dark navy header band
  const headerHeight = 140;
  doc.setFillColor(...BRAND.deepNavy);
  doc.rect(0, 0, pageWidth, headerHeight, "F");

  // ── Bottom accent stripe (brand blue)
  doc.setFillColor(...BRAND.accentBlue);
  doc.rect(0, headerHeight, pageWidth, 6, "F");

  // ── Logo
  const logoSize = 44;
  const logoX = margin;
  const logoY = 20;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoSize, logoSize, undefined, "FAST");
    } catch {
      // ignore logo rendering issues
    }
  }

  // ── Title (next to logo)
  const titleX = logoX + logoSize + 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(title, titleX, logoY + 18);

  // ── Subtitle (below title, constrained width to left portion)
  const subtitleMaxWidth = pageWidth * 0.52;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(180, 195, 220);
  const subtitleLines = doc.splitTextToSize(subtitle, subtitleMaxWidth);
  doc.text(subtitleLines, titleX, logoY + 32);

  // ── Right-side metadata panel
  const metaRightEdge = pageWidth - margin;
  const metaX = metaRightEdge - 160;

  // Top amber tag
  const tagText = "NIE CAMPUS SYNC";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const tagWidth = doc.getTextWidth(tagText) + 16;
  const tagX = metaRightEdge - tagWidth;
  doc.setFillColor(...BRAND.accentAmber);
  doc.roundedRect(tagX, 12, tagWidth, 16, 3, 3, "F");
  doc.setTextColor(10, 10, 10);
  doc.text(tagText, tagX + 8, 23);

  // Metadata rows — properly spaced vertically
  const metaStartY = 46;
  const metaLineHeight = 22;

  const shortReportId = toShortReportId(String(metadata?.reportId || ""));
  const statusText = normalizeStatus(String(metadata?.status || ""));
  const generatedText = toCompactDate(metadata?.generatedAt || new Date().toISOString());

  const metaItems = [
    { label: "CASE REF", value: `#${shortReportId}` },
    { label: "STATUS", value: statusText || "UNKNOWN" },
    { label: "GENERATED", value: generatedText },
  ];

  metaItems.forEach((item, index) => {
    const rowY = metaStartY + index * metaLineHeight;

    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(140, 160, 190);
    doc.text(item.label, metaX, rowY);

    // Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(235, 245, 255);
    const valueLines = doc.splitTextToSize(item.value, 150);
    doc.text(valueLines, metaX + 70, rowY);
  });

  // ── Thin separator within header above bottom stripe
  doc.setDrawColor(60, 80, 120);
  doc.setLineWidth(0.4);
  doc.line(margin, headerHeight - 6, pageWidth - margin, headerHeight - 6);

  // Return the Y position after header + stripe + spacing
  return headerHeight + 6 + 24;
}

/* ── Section heading ── */

function drawSectionHeading(doc: any, title: string, y: number, margin: number, width: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.slateText);
  doc.text(title.toUpperCase(), margin, y);
  doc.setDrawColor(...BRAND.softBorder);
  doc.setLineWidth(0.7);
  doc.line(margin, y + 5, margin + width, y + 5);
  return y + 20;
}

/* ── Field card (2-column summary blocks) ── */

function drawFieldCard(doc: any, x: number, y: number, w: number, h: number, label: string, value: string) {
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

function getFieldCardHeight(doc: any, width: number, value: string, minHeight = 52) {
  const wrapped = doc.splitTextToSize(String(value || "-"), Math.max(60, width - 20));
  return Math.max(minHeight, 36 + wrapped.length * 13);
}

/* ── Status badge ── */

function drawStatusBadge(doc: any, status: string, x: number, y: number) {
  const statusUpper = normalizeStatus(status);
  const isResolved = /RESOLVED|ACKNOWLEDGED/.test(statusUpper);
  const isUnmatched = /UNMATCHED/.test(statusUpper);

  const bg = isResolved
    ? BRAND.emeraldDark
    : isUnmatched
      ? [100, 116, 139]
      : BRAND.accentBlue;

  const badgeWidth = Math.max(82, statusUpper.length * 5.8 + 24);
  const badgeHeight = 22;
  doc.setFillColor(bg[0], bg[1], bg[2]);
  doc.roundedRect(x, y, badgeWidth, badgeHeight, 11, 11, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(statusUpper, x + 12, y + 14);
}

/* ── Paragraph card (legal, metadata, etc.) ── */

function drawParagraphCard(
  doc: any,
  y: number,
  margin: number,
  contentWidth: number,
  pageHeight: number,
  options: {
    title: string;
    lines: string[];
    fillColor?: readonly [number, number, number];
    accentColor?: readonly [number, number, number];
    bullet?: boolean;
  }
) {
  const rows = options.lines.map((line) => doc.splitTextToSize(String(line || ""), contentWidth - 34));
  const contentLineCount = rows.reduce((sum: number, row: string[]) => sum + row.length, 0);
  const height =
    24 + // title band
    14 + // top content padding
    contentLineCount * 12 +
    Math.max(0, rows.length - 1) * 4 +
    14; // bottom padding

  y = ensurePageSpace(doc, y, height + 6, margin, pageHeight);

  const fill = options.fillColor || BRAND.cardBg;
  doc.setDrawColor(...BRAND.softBorder);
  doc.setLineWidth(0.5);
  doc.setFillColor(fill[0], fill[1], fill[2]);
  doc.roundedRect(margin, y, contentWidth, height, 8, 8, "FD");

  // Title band
  const accent = options.accentColor || BRAND.accentBlue;
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.roundedRect(margin, y, contentWidth, 22, 8, 8, "F");
  doc.rect(margin, y + 11, contentWidth, 11, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(String(options.title || "").toUpperCase(), margin + 12, y + 15);

  // Content
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.slateText);

  let lineY = y + 38;
  rows.forEach((wrapped: string[]) => {
    if (options.bullet) {
      doc.setFillColor(...BRAND.accentBlue);
      doc.circle(margin + 16, lineY - 3, 2, "F");
      doc.text(wrapped, margin + 24, lineY);
    } else {
      doc.text(wrapped, margin + 12, lineY);
    }
    lineY += wrapped.length * 12 + 4;
  });

  return y + height + 14;
}

function drawLegalNoticeCard(
  doc: any,
  y: number,
  margin: number,
  contentWidth: number,
  pageHeight: number
) {
  return drawParagraphCard(doc, y, margin, contentWidth, pageHeight, {
    title: "Legal and Compliance Notice",
    lines: [
      "Administrative Use: For NIE campus parking governance, complaint review, and compliance tracking.",
      "Data Integrity: This PDF is system-generated; any manual edits after export invalidate audit integrity.",
      "Policy Scope: Handle under NIE campus policy, institutional code of conduct, and applicable law.",
      "Confidentiality: Contains personal and operational data; share strictly with authorized personnel only.",
    ],
    fillColor: BRAND.legalCardBg,
    accentColor: BRAND.accentBlueDark,
    bullet: true,
  });
}

function drawSystemCertificationCard(
  doc: any,
  y: number,
  margin: number,
  contentWidth: number,
  pageHeight: number
) {
  return drawParagraphCard(doc, y, margin, contentWidth, pageHeight, {
    title: "System Certification",
    lines: [
      "This document is automatically generated from NIE Sync records.",
      "Manual signatures are not required for standard digital evidence workflow.",
      "If a disciplinary or legal committee requests attestation, print and countersign externally.",
    ],
    fillColor: [240, 253, 244],
    accentColor: BRAND.emeraldDark,
  });
}

function drawMetadataCard(
  doc: any,
  y: number,
  margin: number,
  contentWidth: number,
  pageHeight: number,
  lines: string[]
) {
  return drawParagraphCard(doc, y, margin, contentWidth, pageHeight, {
    title: "Document Metadata",
    lines,
    fillColor: BRAND.cardBg,
    accentColor: BRAND.cyan,
  });
}

/* ── Transcript message block ── */

function drawTranscriptMessageBlock(
  doc: any,
  y: number,
  margin: number,
  contentWidth: number,
  pageHeight: number,
  actorLabel: string,
  messageText: string,
  isSystem: boolean
) {
  const bubbleFill = isSystem ? [238, 242, 248] : [248, 250, 255];
  const actorColor = isSystem ? BRAND.slateText : BRAND.accentBlueDark;
  const messageLines = doc.splitTextToSize(messageText || "-", contentWidth - 28);
  let messageCursor = 0;
  let firstChunk = true;

  while (firstChunk || messageCursor < messageLines.length) {
    const actorText = firstChunk ? actorLabel : `${actorLabel} (contd.)`;
    const actorLinesSplit = doc.splitTextToSize(actorText, contentWidth - 28);
    const actorH = actorLinesSplit.length * 12;
    const available = pageHeight - 60 - y;
    const maxMsgLines = Math.floor((available - 34 - actorH) / 12);

    if (maxMsgLines < 2) {
      doc.addPage();
      y = 48;
      y = drawSectionHeading(doc, "Conversation Stream (contd.)", y, margin, contentWidth);
      continue;
    }

    const chunk = messageLines.slice(messageCursor, messageCursor + maxMsgLines);
    const bubbleHeight = 16 + actorH + 6 + chunk.length * 12 + 12;

    doc.setFillColor(bubbleFill[0], bubbleFill[1], bubbleFill[2]);
    doc.setDrawColor(...BRAND.softBorder);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, contentWidth, bubbleHeight, 8, 8, "FD");

    // Accent left border
    const accentBarColor = isSystem ? BRAND.midGray : BRAND.accentBlue;
    doc.setFillColor(accentBarColor[0], accentBarColor[1], accentBarColor[2]);
    doc.rect(margin, y + 6, 3, bubbleHeight - 12, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(actorColor[0], actorColor[1], actorColor[2]);
    doc.text(actorLinesSplit, margin + 14, y + 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...BRAND.ink);
    doc.text(chunk, margin + 14, y + 16 + actorH + 6);

    y += bubbleHeight + 8;
    messageCursor += chunk.length;
    firstChunk = false;
  }

  return y;
}

/* ── Footer ── */

function drawFooter(doc: any, pageNumber: number, totalPages: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const origin = safeOrigin();

  // Separator line
  doc.setDrawColor(...BRAND.softBorder);
  doc.setLineWidth(0.5);
  doc.line(margin, pageHeight - 44, pageWidth - margin, pageHeight - 44);

  // Left text
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.midGray);
  doc.text("NIE Sync  ·  Campus Mobility and Incident Resolution", margin, pageHeight - 30);

  // Links
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.accentBlue);
  if (origin) {
    doc.textWithLink("FAQ", pageWidth - 196, pageHeight - 30, { url: `${origin}/faq` });
    doc.textWithLink("Terms", pageWidth - 162, pageHeight - 30, {
      url: `${origin}/terms-of-service`,
    });
    doc.textWithLink("Privacy", pageWidth - 122, pageHeight - 30, {
      url: `${origin}/privacy-policy`,
    });
  }

  // Page number
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.slateText);
  doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 82, pageHeight - 30);
}

function addFootersToAllPages(doc: any) {
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(doc, page, totalPages);
  }
}

/* ── Photo block ── */

async function drawIncidentPhotoBlock(
  doc: any,
  photoUrl: string,
  y: number,
  margin: number,
  contentWidth: number,
  pageHeight: number
) {
  if (!photoUrl) return y;

  try {
    const photoDataUrl = await urlToDataUrl(photoUrl);
    const { width, height } = await getImageDimensions(photoDataUrl);

    const maxWidth = contentWidth - 16;
    const maxHeight = 240;
    const scale = Math.min(maxWidth / width, maxHeight / height);
    const renderWidth = Math.max(120, Math.floor(width * scale));
    const renderHeight = Math.max(90, Math.floor(height * scale));

    if (y + renderHeight + 28 > pageHeight - 58) {
      doc.addPage();
      y = 48;
    }

    const imageType = photoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";

    doc.setFillColor(...BRAND.cardBg);
    doc.setDrawColor(...BRAND.softBorder);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, contentWidth, renderHeight + 16, 8, 8, "FD");

    doc.addImage(
      photoDataUrl,
      imageType,
      margin + 8,
      y + 8,
      renderWidth,
      renderHeight,
      undefined,
      "FAST"
    );
    return y + renderHeight + 28;
  } catch {
    return y;
  }
}

/* ═══════════════════════════════════════════════════════
   PUBLIC: Download Parking Incident Report PDF
   ═══════════════════════════════════════════════════════ */

export async function downloadParkingIncidentReportPdf(
  input: ParkingIncidentReportPdfInput
): Promise<PdfResult> {
  if (typeof window === "undefined") {
    return { ok: false, error: "PDF export is only available in browser context." };
  }

  try {
    const doc = await createDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    const logoDataUrl = await resolveLogoDataUrl();
    const generatedAtIso = input.generatedAtIso || new Date().toISOString();
    const evidenceFingerprint = await computeEvidenceFingerprint(
      JSON.stringify({
        reportId: input.reportId,
        plate: input.plate,
        location: input.location,
        status: input.status,
        createdAtIso: input.createdAtIso,
        resolvedAtIso: input.resolvedAtIso,
        generatedAtIso,
      })
    );

    let y = drawHeader(
      doc,
      "NIE Sync Incident Dossier",
      "Premium incident evidence report prepared for campus operations, compliance review, and escalation support.",
      logoDataUrl,
      {
        reportId: input.reportId,
        status: input.status,
        generatedAt: generatedAtIso,
      }
    );

    /* ── Incident Summary ── */
    y = drawSectionHeading(doc, "Incident Summary", y, margin, contentWidth);

    const fieldGap = 12;
    const colWidth = (contentWidth - fieldGap) / 2;
    const reportIdValue = `#${toShortReportId(input.reportId)}`;
    const plateValue = String(input.plate || "-");
    const createdValue = toDisplayDate(input.createdAtIso);
    const resolvedValue = toDisplayDate(input.resolvedAtIso);
    const locationValue = String(input.location || "-");

    // Row 1: Report ID | Vehicle Plate
    const rowOneHeight = Math.max(
      getFieldCardHeight(doc, colWidth, reportIdValue),
      getFieldCardHeight(doc, colWidth, plateValue)
    );
    drawFieldCard(doc, margin, y, colWidth, rowOneHeight, "Report ID", reportIdValue);
    drawFieldCard(doc, margin + colWidth + fieldGap, y, colWidth, rowOneHeight, "Vehicle Plate", plateValue);
    y += rowOneHeight + 10;

    // Row 2: Created | Resolved
    const rowTwoHeight = Math.max(
      getFieldCardHeight(doc, colWidth, createdValue),
      getFieldCardHeight(doc, colWidth, resolvedValue)
    );
    drawFieldCard(doc, margin, y, colWidth, rowTwoHeight, "Created", createdValue);
    drawFieldCard(doc, margin + colWidth + fieldGap, y, colWidth, rowTwoHeight, "Resolved", resolvedValue);
    y += rowTwoHeight + 10;

    // Row 3: Location (full width)
    const locationHeight = getFieldCardHeight(doc, contentWidth, locationValue, 56);
    drawFieldCard(doc, margin, y, contentWidth, locationHeight, "Location", locationValue);
    y += locationHeight + 14;

    // Status badge (standalone, below location)
    drawStatusBadge(doc, input.status, margin, y);
    y += 36;

    /* ── Reporter Note ── */
    y = drawSectionHeading(doc, "Reporter Note", y, margin, contentWidth);
    const noteText = String(input.reporterNote || input.location || "No reporter note recorded.");
    const noteLines = doc.splitTextToSize(noteText, contentWidth - 24);
    const noteHeight = Math.max(48, noteLines.length * 14 + 22);

    doc.setFillColor(...BRAND.cardBg);
    doc.setDrawColor(...BRAND.softBorder);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, contentWidth, noteHeight, 6, 6, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.ink);
    doc.text(noteLines, margin + 12, y + 20);
    y += noteHeight + 18;

    /* ── Incident Photo ── */
    const incidentPhotoUrl = String(input.incidentPhotoUrl || "").trim();
    if (incidentPhotoUrl) {
      y = ensurePageSpace(doc, y, 120, margin, pageHeight);
      y = drawSectionHeading(doc, "Incident Photo", y, margin, contentWidth);
      y = await drawIncidentPhotoBlock(doc, incidentPhotoUrl, y, margin, contentWidth, pageHeight);
    }

    /* ── Document Metadata ── */
    y = ensurePageSpace(doc, y, 100, margin, pageHeight);
    y = drawSectionHeading(doc, "Document Metadata", y, margin, contentWidth);
    const metadataLines = [
      `Generated At: ${toCompactDate(generatedAtIso)}`,
      `Evidence Fingerprint (SHA-256 Ref): ${evidenceFingerprint}`,
      "Document Class: Administrative Incident Record",
      "Retention Recommendation: Maintain with incident file as per institutional policy.",
    ];
    y = drawMetadataCard(doc, y, margin, contentWidth, pageHeight, metadataLines);

    /* ── Compliance ── */
    y = ensurePageSpace(doc, y, 120, margin, pageHeight);
    y = drawSectionHeading(doc, "Compliance", y, margin, contentWidth);
    y = drawLegalNoticeCard(doc, y, margin, contentWidth, pageHeight);
    y = drawSystemCertificationCard(doc, y, margin, contentWidth, pageHeight);

    addFootersToAllPages(doc);

    const normalizedPlate = normalizeFilePlate(input.plate);
    const shortId = toShortReportId(input.reportId) || "REPORT";
    doc.save(`parking-incident-dossier-${normalizedPlate || "VEHICLE"}-${shortId}.pdf`);
    return { ok: true };
  } catch (error: any) {
    return {
      ok: false,
      error: error?.message || "Unable to generate incident report PDF.",
    };
  }
}

/* ═══════════════════════════════════════════════════════
   PUBLIC: Download Parking Transcript PDF
   ═══════════════════════════════════════════════════════ */

export async function downloadParkingTranscriptPdf(
  input: ParkingTranscriptPdfInput
): Promise<PdfResult> {
  if (typeof window === "undefined") {
    return { ok: false, error: "PDF export is only available in browser context." };
  }

  try {
    const doc = await createDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    const logoDataUrl = await resolveLogoDataUrl();
    const generatedAtIso = input.generatedAtIso || new Date().toISOString();
    const evidenceFingerprint = await computeEvidenceFingerprint(
      JSON.stringify({
        reportId: input.reportId,
        plate: input.plate,
        status: input.status,
        createdAtIso: input.createdAtIso,
        resolvedAtIso: input.resolvedAtIso,
        generatedAtIso,
        lineCount: input.transcriptLines?.length || 0,
      })
    );

    let y = drawHeader(
      doc,
      "NIE Sync Transcript Dossier",
      "Authenticated chat evidence package for incident traceability, operations review, and compliance workflows.",
      logoDataUrl,
      {
        reportId: input.reportId,
        status: input.status,
        generatedAt: generatedAtIso,
      }
    );

    /* ── Transcript Header fields ── */
    y = drawSectionHeading(doc, "Transcript Header", y, margin, contentWidth);

    const fieldGap = 12;
    const colWidth = (contentWidth - fieldGap) / 2;
    const reportIdValue = `#${toShortReportId(input.reportId)}`;
    const plateValue = String(input.plate || "-");
    const statusValue = normalizeStatus(input.status);
    const createdValue = toDisplayDate(input.createdAtIso);

    const rowOneHeight = Math.max(
      getFieldCardHeight(doc, colWidth, reportIdValue, 52),
      getFieldCardHeight(doc, colWidth, plateValue, 52)
    );
    drawFieldCard(doc, margin, y, colWidth, rowOneHeight, "Report ID", reportIdValue);
    drawFieldCard(doc, margin + colWidth + fieldGap, y, colWidth, rowOneHeight, "Vehicle Plate", plateValue);
    y += rowOneHeight + 10;

    const rowTwoHeight = Math.max(
      getFieldCardHeight(doc, colWidth, statusValue, 52),
      getFieldCardHeight(doc, colWidth, createdValue, 52)
    );
    drawFieldCard(doc, margin, y, colWidth, rowTwoHeight, "Status", statusValue);
    drawFieldCard(doc, margin + colWidth + fieldGap, y, colWidth, rowTwoHeight, "Created", createdValue);
    y += rowTwoHeight + 16;

    /* ── Incident Photo ── */
    const incidentPhotoUrl = String(input.incidentPhotoUrl || "").trim();
    if (incidentPhotoUrl) {
      y = ensurePageSpace(doc, y, 120, margin, pageHeight);
      y = drawSectionHeading(doc, "Incident Photo Snapshot", y, margin, contentWidth);
      y = await drawIncidentPhotoBlock(doc, incidentPhotoUrl, y, margin, contentWidth, pageHeight);
    }

    /* ── Conversation Stream ── */
    y = ensurePageSpace(doc, y, 60, margin, pageHeight);
    y = drawSectionHeading(doc, "Conversation Stream", y, margin, contentWidth);

    const transcriptLines = (input.transcriptLines || []).filter(Boolean);
    if (transcriptLines.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.slateText);
      doc.text("No transcript messages were stored for this report.", margin, y + 2);
      y += 24;
    } else {
      for (const line of transcriptLines) {
        const parsed = parseTranscriptLine(line);
        const isSystem = /system/i.test(parsed.actor);
        const actorLine = `${parsed.actor}${parsed.timestamp ? `  ·  ${parsed.timestamp}` : ""}`;
        y = drawTranscriptMessageBlock(
          doc,
          y,
          margin,
          contentWidth,
          pageHeight,
          actorLine,
          parsed.message || "-",
          isSystem
        );
      }
    }

    /* ── Transcript Metadata ── */
    y += 8;
    y = ensurePageSpace(doc, y, 100, margin, pageHeight);
    y = drawSectionHeading(doc, "Transcript Metadata", y, margin, contentWidth);
    const metadataLines = [
      `Generated At: ${toCompactDate(generatedAtIso)}`,
      `Evidence Fingerprint (SHA-256 Ref): ${evidenceFingerprint}`,
      `Transcript Messages: ${Math.max(0, transcriptLines.length)}`,
      "Document Class: Conversation Evidence Log",
    ];
    y = drawMetadataCard(doc, y, margin, contentWidth, pageHeight, metadataLines);

    /* ── Compliance ── */
    y = ensurePageSpace(doc, y, 120, margin, pageHeight);
    y = drawSectionHeading(doc, "Compliance", y, margin, contentWidth);
    y = drawLegalNoticeCard(doc, y, margin, contentWidth, pageHeight);
    y = drawSystemCertificationCard(doc, y, margin, contentWidth, pageHeight);

    addFootersToAllPages(doc);

    const normalizedPlate = normalizeFilePlate(input.plate);
    const shortId = toShortReportId(input.reportId) || "REPORT";
    doc.save(`parking-transcript-dossier-${normalizedPlate || "VEHICLE"}-${shortId}.pdf`);
    return { ok: true };
  } catch (error: any) {
    return {
      ok: false,
      error: error?.message || "Unable to generate transcript PDF.",
    };
  }
}

export async function downloadParkingReportPdf(
  input: ParkingIncidentReportPdfInput
): Promise<PdfResult> {
  return downloadParkingIncidentReportPdf(input);
}
