// @ts-nocheck

function normalizeBaseUrl(value: string) {
  return String(value || "").trim().replace(/\/$/, "");
}

function getAppBaseUrl() {
  return (
    normalizeBaseUrl(Deno.env.get("PARKING_APP_BASE_URL") || "") ||
    normalizeBaseUrl(Deno.env.get("NEXT_PUBLIC_APP_URL") || "") ||
    normalizeBaseUrl(Deno.env.get("NEXT_PUBLIC_SITE_URL") || "") ||
    normalizeBaseUrl(Deno.env.get("SITE_URL") || "")
  );
}

Deno.serve(async (request) => {
  const requestSecret = request.headers.get("x-cron-secret") || "";
  const edgeCronSecret = Deno.env.get("PARKING_CRON_SECRET") || "";

  if (!edgeCronSecret || requestSecret !== edgeCronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const appBaseUrl = getAppBaseUrl();
  if (!appBaseUrl) {
    return new Response(
      JSON.stringify({
        error:
          "Missing app base URL. Set PARKING_APP_BASE_URL (or NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL / SITE_URL).",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const appCronSecret =
    Deno.env.get("PARKING_APP_CRON_SECRET") ||
    Deno.env.get("CRON_SECRET") ||
    edgeCronSecret;

  const targetUrl = `${appBaseUrl}/api/cron/parking-escalate?secret=${encodeURIComponent(appCronSecret)}`;

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "x-trigger-source": "supabase-edge-proxy",
      },
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to call app cron endpoint.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
