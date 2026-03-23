export type ParkingStatus =
  | "pending"
  | "chatting"
  | "acknowledged"
  | "email_sent"
  | "resolved"
  | "unmatched"
  | "expired";

export type ParkingReportAccessRow = {
  reported_by: string | null;
  matched_owner_id: string | null;
  status: ParkingStatus;
  phone_revealed: boolean;
  created_at: string;
  email_sent_at?: string | null;
  acknowledged_at?: string | null;
};

function getCreatedAtMs(createdAt: string) {
  const value = new Date(createdAt).getTime();
  return Number.isNaN(value) ? 0 : value;
}

export function isChatWindowOpen(report: ParkingReportAccessRow | null, nowMs = Date.now()) {
  if (!report) return false;
  if (!["pending", "chatting"].includes(report.status)) return false;
  const createdMs = getCreatedAtMs(report.created_at);
  if (!createdMs) return false;
  return nowMs - createdMs < 1 * 60 * 1000;
}

export function canOwnerAcknowledgeReport(
  report: ParkingReportAccessRow | null,
  userId: string
) {
  if (!report || !userId) return false;
  if (report.matched_owner_id !== userId) return false;
  return ["pending", "chatting", "email_sent"].includes(report.status);
}

export function canReporterResolveReport(
  report: ParkingReportAccessRow | null,
  userId: string
) {
  if (!report || !userId) return false;
  if (report.reported_by !== userId) return false;
  if (report.status === "acknowledged") return true;
  return report.status === "email_sent" && Boolean(report.phone_revealed);
}

export function canReporterRevealOwnerPhone(
  report: ParkingReportAccessRow | null,
  userId: string,
  nowMs = Date.now()
) {
  if (!report || !userId) return false;
  if (report.reported_by !== userId) return false;
  if (report.status !== "email_sent") return false;
  const emailSentMs = getCreatedAtMs(String(report.email_sent_at || ""));
  if (!emailSentMs) return false;
  return nowMs - emailSentMs >= 1 * 60 * 1000;
}

export function canReporterMarkUnresolved(
  report: ParkingReportAccessRow | null,
  userId: string,
  nowMs = Date.now()
) {
  if (!report || !userId) return false;
  if (report.reported_by !== userId) return false;
  if (report.status !== "acknowledged") return false;
  const acknowledgedAtMs = getCreatedAtMs(String(report.acknowledged_at || ""));
  if (!acknowledgedAtMs) return false;
  return nowMs - acknowledgedAtMs >= 5 * 60 * 1000;
}

export function canReporterCancelReport(
  report: ParkingReportAccessRow | null,
  userId: string,
  nowMs = Date.now()
) {
  if (!report || !userId) return false;
  if (report.reported_by !== userId) return false;
  if (!["pending", "chatting"].includes(report.status)) return false;
  return isChatWindowOpen(report, nowMs);
}
