import { createClient } from "@supabase/supabase-js";
import { sendParkingEmail } from "@/lib/mailer";

type OwnerProfile = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

type EscalationReportRow = {
  id: string;
  license_plate: string;
  location_description: string;
  resolve_token: string;
  matched_owner_id: string | null;
  matched_owner?: OwnerProfile | OwnerProfile[] | null;
};

export type ParkingEscalationSummary = {
  scanned: number;
  escalated: number;
  failures: Array<{ reportId: string; error: string }>;
};

export type ParkingSingleEscalationSummary = {
  reportId: string;
  escalated: boolean;
  error?: string;
};

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getOwnerProfile(owner: EscalationReportRow["matched_owner"]): OwnerProfile | null {
  if (!owner) return null;
  if (Array.isArray(owner)) return owner[0] || null;
  return owner;
}

function getOwnerDisplayName(owner: OwnerProfile | null) {
  const fullName = String(owner?.full_name || "").trim();
  if (fullName) return fullName;

  const firstName = String(owner?.first_name || "").trim();
  const lastName = String(owner?.last_name || "").trim();
  const combined = `${firstName} ${lastName}`.trim();
  return combined || "Vehicle Owner";
}

function getDueCutoffIso() {
  return new Date(Date.now() - 2 * 60 * 1000).toISOString();
}

function normalizeBaseUrl(value: string) {
  const trimmed = String(value || "").trim().replace(/\/$/, "");
  if (!trimmed) return "";

  if (
    trimmed.startsWith("http://") &&
    !trimmed.includes("localhost") &&
    !trimmed.includes("127.0.0.1")
  ) {
    return `https://${trimmed.slice("http://".length)}`;
  }

  return trimmed;
}

type EscalateRowResult = { escalated: boolean; error?: string };

async function escalateReportRow(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  report: EscalationReportRow,
  appBaseUrl: string
): Promise<EscalateRowResult> {
  try {
    const owner = getOwnerProfile(report.matched_owner);
    let ownerEmail = String(owner?.email || "").trim();
    const ownerName = getOwnerDisplayName(owner);

    if (!ownerEmail && report.matched_owner_id) {
      const { data: ownerUser, error: ownerUserError } = await supabase.auth.admin.getUserById(
        report.matched_owner_id
      );
      if (!ownerUserError) {
        ownerEmail = String(ownerUser?.user?.email || "").trim();
      }
    }

    if (!ownerEmail) {
      return { escalated: false, error: "Matched owner email is missing." };
    }

    const resolveUrl = `${appBaseUrl}/resolve/${report.id}/${report.resolve_token}`;
    await sendParkingEmail({
      toEmail: ownerEmail,
      ownerName,
      plate: report.license_plate,
      location: report.location_description,
      resolveUrl,
    });

    const { data: updated, error: updateError } = await supabase
      .from("parking_reports")
      .update({
        status: "email_sent",
        email_sent_at: new Date().toISOString(),
      })
      .eq("id", report.id)
      .in("status", ["pending", "chatting"])
      .is("email_sent_at", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return { escalated: false, error: updateError.message || "Failed to update parking report status." };
    }

    if (!updated?.id) {
      return { escalated: false };
    }

    const { error: messageError } = await supabase.from("parking_report_messages").insert({
      report_id: report.id,
      sender_role: "system",
      message: "No response in 2 minutes. An email has been sent to the vehicle owner.",
    });

    if (messageError) {
      return { escalated: false, error: messageError.message || "Failed to insert escalation message." };
    }

    return { escalated: true };
  } catch (error) {
    return {
      escalated: false,
      error: error instanceof Error ? error.message : "Unknown escalation error.",
    };
  }
}

export async function runParkingEscalation(appBaseUrl: string): Promise<ParkingEscalationSummary> {
  const supabase = getSupabaseAdminClient();
  const normalizedBaseUrl = normalizeBaseUrl(appBaseUrl);
  if (!normalizedBaseUrl) {
    throw new Error("App base URL is required for parking escalation emails.");
  }

  const { data: reports, error: reportsError } = await supabase
    .from("parking_reports")
    .select(
      `
      id,
      license_plate,
      location_description,
      resolve_token,
      matched_owner_id,
      matched_owner:profiles!matched_owner_id (
        *
      )
    `
    )
    .in("status", ["pending", "chatting"])
    .is("email_sent_at", null)
    .lte("created_at", getDueCutoffIso())
    .not("matched_owner_id", "is", null)
    .order("created_at", { ascending: true });

  if (reportsError) {
    throw new Error(reportsError.message || "Failed to fetch due parking reports.");
  }

  const summary: ParkingEscalationSummary = {
    scanned: reports?.length || 0,
    escalated: 0,
    failures: [],
  };

  for (const report of (reports || []) as EscalationReportRow[]) {
    const result = await escalateReportRow(supabase, report, normalizedBaseUrl);
    if (result.escalated) {
      summary.escalated += 1;
      continue;
    }

    if (result.error) {
      summary.failures.push({
        reportId: report.id,
        error: result.error,
      });
    }
  }

  return summary;
}

export async function runParkingEscalationForReport(
  reportId: string,
  appBaseUrl: string
): Promise<ParkingSingleEscalationSummary> {
  const normalizedReportId = String(reportId || "").trim();
  if (!normalizedReportId) {
    return { reportId: "", escalated: false, error: "Report id is required." };
  }

  const supabase = getSupabaseAdminClient();
  const normalizedBaseUrl = normalizeBaseUrl(appBaseUrl);
  if (!normalizedBaseUrl) {
    return {
      reportId: normalizedReportId,
      escalated: false,
      error: "App base URL is required for parking escalation emails.",
    };
  }

  const { data: report, error } = await supabase
    .from("parking_reports")
    .select(
      `
      id,
      license_plate,
      location_description,
      resolve_token,
      matched_owner_id,
      matched_owner:profiles!matched_owner_id (
        *
      )
    `
    )
    .eq("id", normalizedReportId)
    .in("status", ["pending", "chatting"])
    .is("email_sent_at", null)
    .lte("created_at", getDueCutoffIso())
    .not("matched_owner_id", "is", null)
    .maybeSingle();

  if (error) {
    return {
      reportId: normalizedReportId,
      escalated: false,
      error: error.message || "Failed to fetch parking report for escalation.",
    };
  }

  if (!report) {
    return { reportId: normalizedReportId, escalated: false };
  }

  const result = await escalateReportRow(supabase, report as EscalationReportRow, normalizedBaseUrl);
  return {
    reportId: normalizedReportId,
    escalated: result.escalated,
    error: result.error,
  };
}
