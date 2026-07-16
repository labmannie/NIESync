import { NextRequest, NextResponse } from "next/server";
import { runParkingEscalation } from "@/lib/parkingEscalation";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveAppBaseUrl(request: NextRequest) {
  const configured = String(process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return request.nextUrl.origin.replace(/\/$/, "");
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
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
