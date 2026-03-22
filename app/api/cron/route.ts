import { NextRequest, NextResponse } from "next/server";
import { runParkingEscalation } from "@/lib/parkingEscalation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(request: NextRequest) {
  const raw = String(request.headers.get("authorization") || "");
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
}

function resolveAppBaseUrl(request: NextRequest) {
  const configured = String(process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return request.nextUrl.origin.replace(/\/$/, "");
}

export async function GET(request: NextRequest) {
  const expectedSecret = String(process.env.CRON_SECRET || "").trim();
  const querySecret = String(request.nextUrl.searchParams.get("secret") || "").trim();
  const bearerSecret = getBearerToken(request);

  const authorized = Boolean(
    expectedSecret && (querySecret === expectedSecret || bearerSecret === expectedSecret)
  );

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const appBaseUrl = resolveAppBaseUrl(request);
    const summary = await runParkingEscalation(appBaseUrl);
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected cron escalation error.",
      },
      { status: 500 }
    );
  }
}
