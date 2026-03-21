// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type DueReport = {
  id: string;
  license_plate: string;
  location_description: string;
  resolve_token: string;
  matched_owner_id: string | null;
  status: "pending" | "chatting";
  created_at: string;
};

const threeMinutesAgoIso = () => new Date(Date.now() - 3 * 60 * 1000).toISOString();

function buildResolveLink(reportId: string, token: string) {
  const appBaseUrl =
    Deno.env.get("PARKING_APP_BASE_URL") ||
    Deno.env.get("NEXT_PUBLIC_SITE_URL") ||
    Deno.env.get("SITE_URL") ||
    "http://localhost:3000";

  return `${appBaseUrl.replace(/\/$/, "")}/resolve/${reportId}/${token}`;
}

async function sendEscalationEmail({
  resendApiKey,
  fromEmail,
  toEmail,
  report,
}: {
  resendApiKey: string;
  fromEmail: string;
  toEmail: string;
  report: DueReport;
}) {
  const resolveLink = buildResolveLink(report.id, report.resolve_token);
  const idempotencyKey = `parking-email-${report.id}`;

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; color: #0f172a;">
      <h2 style="margin: 0 0 12px;">⚠️ Action Required — Your Vehicle is Blocking Campus Traffic at NIE</h2>
      <p style="margin: 0 0 10px;">A parking report was raised for <strong>${report.license_plate}</strong>.</p>
      <p style="margin: 0 0 10px;"><strong>Location:</strong> ${report.location_description}</p>
      <p style="margin: 0 0 16px;">If you are moving your vehicle now, confirm using the secure link below:</p>
      <a href="${resolveLink}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700;">
        I'm Moving — Click to Resolve
      </a>
      <p style="margin: 16px 0 0; color: #475569; font-size: 13px;">
        This link resolves the report immediately.
      </p>
    </div>
  `.trim();

  const text = [
    "Action Required: Your Vehicle is Blocking Campus Traffic at NIE",
    `Vehicle: ${report.license_plate}`,
    `Location: ${report.location_description}`,
    `Resolve now: ${resolveLink}`,
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: "⚠️ Action Required — Your Vehicle is Blocking Campus Traffic at NIE",
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend failed (${response.status}): ${body}`);
  }
}

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get("PARKING_CRON_SECRET") || "";
  const requestSecret = request.headers.get("x-cron-secret") || "";
  if (!cronSecret || requestSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail =
    Deno.env.get("PARKING_FROM_EMAIL") ||
    Deno.env.get("RESEND_FROM_EMAIL") ||
    "NIE Sync <parking@niesync.in>";

  if (!supabaseUrl || !supabaseServiceRoleKey || !resendApiKey) {
    return new Response(
      JSON.stringify({ error: "Missing required environment variables." }),
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: reports, error: reportsError } = await supabase
    .from("parking_reports")
    .select("id, license_plate, location_description, resolve_token, matched_owner_id, status, created_at")
    .in("status", ["pending", "chatting"])
    .is("email_sent_at", null)
    .not("matched_owner_id", "is", null)
    .lte("created_at", threeMinutesAgoIso())
    .order("created_at", { ascending: true })
    .limit(100);

  if (reportsError) {
    return new Response(
      JSON.stringify({ error: reportsError.message || "Failed to fetch due reports." }),
      { status: 500 }
    );
  }

  let escalatedCount = 0;
  const failures: Array<{ reportId: string; error: string }> = [];

  for (const report of (reports || []) as DueReport[]) {
    try {
      if (!report.matched_owner_id) continue;

      const { data: ownerUser, error: ownerError } = await supabase.auth.admin.getUserById(
        report.matched_owner_id
      );
      if (ownerError || !ownerUser?.user?.email) {
        throw new Error(ownerError?.message || "Owner email not available.");
      }

      await sendEscalationEmail({
        resendApiKey,
        fromEmail,
        toEmail: ownerUser.user.email,
        report,
      });

      const { data: updatedRow, error: updateError } = await supabase
        .from("parking_reports")
        .update({
          status: "email_sent",
          email_sent_at: new Date().toISOString(),
        })
        .eq("id", report.id)
        .is("email_sent_at", null)
        .in("status", ["pending", "chatting"])
        .select("id")
        .maybeSingle();

      if (updateError) {
        throw new Error(updateError.message || "Failed updating report status.");
      }

      if (updatedRow?.id) {
        escalatedCount += 1;
        await supabase.from("parking_report_messages").insert({
          report_id: report.id,
          sender_role: "system",
          message: "No response in 3 minutes. An email has been sent to the vehicle owner.",
        });
      }
    } catch (error) {
      failures.push({
        reportId: report.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return new Response(
    JSON.stringify({
      scanned: reports?.length || 0,
      escalated: escalatedCount,
      failures,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
