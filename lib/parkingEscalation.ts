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
  photo_url: string | null;
  status: "pending" | "chatting" | "email_sent" | "acknowledged" | "resolved" | "unmatched" | "expired";
  matched_owner_id: string | null;
  matched_owner?: OwnerProfile | OwnerProfile[] | null;
};

export type ParkingEscalationSummary = {
  scanned: number;
  escalated: number;
  autoResolved: number;
  emailSendStats: {
    count: number;
    avgMs: number;
    maxMs: number;
  };
  failures: Array<{ reportId: string; error: string }>;
};

const INCIDENT_PHOTOS_BUCKET = "incident-photos";

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
  return new Date(Date.now() - 1 * 60 * 1000).toISOString();
}

function getDispatchStaleCutoffIso() {
  return new Date(Date.now() - 5 * 60 * 1000).toISOString();
}

function getAutoResolveCutoffIso() {
  return new Date(Date.now() - 10 * 60 * 1000).toISOString();
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

type EscalateRowResult = { escalated: boolean; error?: string; sendMs?: number };

async function releaseStaleDispatchLocks(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  await supabase
    .from("parking_reports")
    .update({ email_dispatch_started_at: null })
    .in("status", ["pending", "chatting"])
    .is("email_sent_at", null)
    .not("email_dispatch_started_at", "is", null)
    .lte("email_dispatch_started_at", getDispatchStaleCutoffIso());
}

async function runParkingAutoResolve(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const resolvedAt = new Date().toISOString();
  const cutoffIso = getAutoResolveCutoffIso();
  let autoResolved = 0;

  const { data: acknowledgedRows, error: acknowledgedError } = await supabase
    .from("parking_reports")
    .update({
      status: "resolved",
      resolved_at: resolvedAt,
    })
    .eq("status", "acknowledged")
    .is("resolved_at", null)
    .not("acknowledged_at", "is", null)
    .lte("acknowledged_at", cutoffIso)
    .select("id");

  if (acknowledgedError) {
    throw new Error(acknowledgedError.message || "Failed to auto-resolve acknowledged parking reports.");
  }

  if ((acknowledgedRows || []).length > 0) {
    autoResolved += acknowledgedRows!.length;
    const messages = acknowledgedRows!.map((row) => ({
      report_id: row.id,
      sender_role: "system" as const,
      message: "Auto-resolved after 10 minutes without reporter confirmation.",
    }));
    await supabase.from("parking_report_messages").insert(messages);
  }

  const { data: calledRows, error: calledError } = await supabase
    .from("parking_reports")
    .update({
      status: "resolved",
      resolved_at: resolvedAt,
    })
    .eq("status", "email_sent")
    .eq("phone_revealed", true)
    .is("resolved_at", null)
    .not("phone_revealed_at", "is", null)
    .lte("phone_revealed_at", cutoffIso)
    .select("id");

  if (calledError) {
    throw new Error(calledError.message || "Failed to auto-resolve post-call parking reports.");
  }

  if ((calledRows || []).length > 0) {
    autoResolved += calledRows!.length;
    const messages = calledRows!.map((row) => ({
      report_id: row.id,
      sender_role: "system" as const,
      message: "Auto-resolved after 10 minutes since phone reveal without reporter confirmation.",
    }));
    await supabase.from("parking_report_messages").insert(messages);
  }

  return autoResolved;
}

async function escalateReportRow(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  report: EscalationReportRow,
  appBaseUrl: string
): Promise<EscalateRowResult> {
  try {
    const dispatchStartedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from("parking_reports")
      .update({
        email_dispatch_started_at: dispatchStartedAt,
      })
      .eq("id", report.id)
      .in("status", ["pending", "chatting"])
      .is("email_sent_at", null)
      .is("email_dispatch_started_at", null)
      .select("id")
      .maybeSingle();

    if (claimError) {
      return { escalated: false, error: claimError.message || "Failed to lock parking report for escalation." };
    }

    if (!claimed?.id) {
      return { escalated: false };
    }

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
      await supabase
        .from("parking_reports")
        .update({
          email_dispatch_started_at: null,
        })
        .eq("id", report.id)
        .eq("email_dispatch_started_at", dispatchStartedAt);
      return { escalated: false, error: "Matched owner email is missing." };
    }

    let photoSignedUrl = "";
    if (report.photo_url) {
      const { data: signedPhoto, error: signedPhotoError } = await supabase.storage
        .from(INCIDENT_PHOTOS_BUCKET)
        .createSignedUrl(report.photo_url, 24 * 60 * 60);
      if (!signedPhotoError) {
        photoSignedUrl = String(signedPhoto?.signedUrl || "");
      }
    }

    const resolveUrl = `${appBaseUrl}/resolve/${report.id}/${report.resolve_token}`;
    let sendMs = 0;
    try {
      const sendStartedAt = Date.now();
      await sendParkingEmail({
        toEmail: ownerEmail,
        ownerName,
        plate: report.license_plate,
        location: report.location_description,
        resolveUrl,
        photoUrl: photoSignedUrl || null,
      });
      sendMs = Date.now() - sendStartedAt;
    } catch (error) {
      await supabase
        .from("parking_reports")
        .update({
          email_dispatch_started_at: null,
        })
        .eq("id", report.id)
        .eq("email_dispatch_started_at", dispatchStartedAt);

      return {
        escalated: false,
        error: error instanceof Error ? error.message : "Failed to send parking escalation email.",
      };
    }

    const emailSentAt = new Date().toISOString();
    const { data: markedSent, error: markedSentError } = await supabase
      .from("parking_reports")
      .update({
        status: "email_sent",
        email_sent_at: emailSentAt,
        email_dispatch_started_at: null,
      })
      .eq("id", report.id)
      .eq("email_dispatch_started_at", dispatchStartedAt)
      .is("email_sent_at", null)
      .in("status", ["pending", "chatting"])
      .select("id")
      .maybeSingle();

    if (markedSentError) {
      return {
        escalated: false,
        error: markedSentError.message || "Failed to update parking report after email send.",
      };
    }

    if (!markedSent?.id) {
      return { escalated: false };
    }

    const { error: messageError } = await supabase.from("parking_report_messages").insert({
      report_id: report.id,
      sender_role: "system",
      message: "No response in 1 minute. An email has been sent to the vehicle owner.",
    });

    if (messageError) {
      return { escalated: false, error: messageError.message || "Failed to insert escalation message." };
    }

    return { escalated: true, sendMs };
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

  await releaseStaleDispatchLocks(supabase);
  const autoResolved = await runParkingAutoResolve(supabase);

  const { data: reports, error: reportsError } = await supabase
    .from("parking_reports")
    .select(
      `
      id,
      license_plate,
      location_description,
      resolve_token,
      photo_url,
      status,
      matched_owner_id,
      matched_owner:profiles!matched_owner_id (
        *
      )
    `
    )
    .in("status", ["pending", "chatting"])
    .is("email_sent_at", null)
    .is("email_dispatch_started_at", null)
    .lte("created_at", getDueCutoffIso())
    .not("matched_owner_id", "is", null)
    .order("created_at", { ascending: true });

  if (reportsError) {
    throw new Error(reportsError.message || "Failed to fetch due parking reports.");
  }

  const summary: ParkingEscalationSummary = {
    scanned: reports?.length || 0,
    escalated: 0,
    autoResolved,
    emailSendStats: {
      count: 0,
      avgMs: 0,
      maxMs: 0,
    },
    failures: [],
  };

  let emailSendTotalMs = 0;

  const queue = [...((reports || []) as EscalationReportRow[])];
  const workerCount = Math.min(3, Math.max(1, queue.length));

  const runWorker = async () => {
    while (queue.length > 0) {
      const report = queue.shift();
      if (!report) break;

      const result = await escalateReportRow(supabase, report, normalizedBaseUrl);
      if (result.escalated) {
        summary.escalated += 1;
        if (typeof result.sendMs === "number") {
          summary.emailSendStats.count += 1;
          emailSendTotalMs += result.sendMs;
          summary.emailSendStats.maxMs = Math.max(summary.emailSendStats.maxMs, result.sendMs);
        }
        continue;
      }

      if (result.error) {
        summary.failures.push({
          reportId: report.id,
          error: result.error,
        });
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  if (summary.emailSendStats.count > 0) {
    summary.emailSendStats.avgMs = Math.round(emailSendTotalMs / summary.emailSendStats.count);
  }

  return summary;
}
