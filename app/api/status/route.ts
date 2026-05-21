import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Helper to measure promises with a timeout
async function withTimeout<T>(promise: any, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([
    Promise.resolve(promise).then((res) => {
      clearTimeout(timer);
      return res as T;
    }),
    timeoutPromise
  ]);
}

export async function GET() {
  const supabase = await createClient();
  
  // 1. Check Database Latency & Connectivity
  const dbStart = Date.now();
  let dbStatus = "operational";
  let dbLatency = 0;
  try {
    const dbPromise = supabase.from("profiles").select("id").limit(1);
    const { error } = await withTimeout(dbPromise, 3000, { error: new Error("Timeout") } as any);
    dbLatency = Date.now() - dbStart;
    if (error) {
      dbStatus = "degraded";
    }
  } catch (err) {
    dbStatus = "outage";
    dbLatency = Date.now() - dbStart;
  }

  // 2. Check Supabase Auth Service Health (GoTrue)
  const authStart = Date.now();
  let authStatus = "operational";
  let authLatency = 0;
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    if (supabaseUrl) {
      const authPromise = fetch(`${supabaseUrl}/auth/v1/health`, { signal: AbortSignal.timeout(3000) });
      const authRes = await authPromise;
      authLatency = Date.now() - authStart;
      if (!authRes.ok) {
        authStatus = "degraded";
      }
    } else {
      authStatus = "degraded";
    }
  } catch (err) {
    authStatus = "outage";
    authLatency = Date.now() - authStart;
  }

  // 3. Check Supabase Storage Service
  const storageStart = Date.now();
  let storageStatus = "operational";
  let storageLatency = 0;
  try {
    const storagePromise = supabase.storage.listBuckets();
    const { error } = await withTimeout(storagePromise, 3000, { error: new Error("Timeout") } as any);
    storageLatency = Date.now() - storageStart;
    if (error) {
      storageStatus = "degraded";
    }
  } catch (err) {
    storageStatus = "outage";
    storageLatency = Date.now() - storageStart;
  }

  // 4. Check Background Cron Workers (using check_cron_status RPC, fallback to database readiness)
  const cronStart = Date.now();
  let cronStatus = "operational";
  let cronLatency = 0;
  try {
    const cronPromise = supabase.rpc("check_cron_status");
    const { data: rpcData, error: rpcError } = await withTimeout(
      cronPromise,
      3000,
      { error: new Error("Timeout") } as any
    );
    
    cronLatency = Date.now() - cronStart;
    
    if (rpcError || !rpcData || (rpcData as any).status !== "active") {
      // If RPC is missing or returns error/inactive status, try standard table select to see if at least database can be reached
      const fallbackPromise = supabase.from("lost_and_found_reports").select("id").limit(1);
      const { error: fallbackError } = await withTimeout(
        fallbackPromise,
        2000,
        { error: new Error("Timeout") } as any
      );
      if (fallbackError) {
        cronStatus = "outage";
      } else {
        cronStatus = "degraded"; // Database is up but pg_cron or our specific job might be inactive/missing
      }
    }
  } catch (err) {
    cronStatus = "outage";
    cronLatency = Date.now() - cronStart;
  }

  // 5. Check Nodemailer Mailer Service
  const mailerStart = Date.now();
  let mailerStatus = "operational";
  let mailerLatency = 0;
  const smtpUser = String(process.env.GMAIL_USER || "").trim();
  const smtpPassword = String(process.env.GMAIL_APP_PASSWORD || "").trim();

  if (!smtpUser || !smtpPassword) {
    mailerStatus = "operational";
  } else {
    try {
      const emailDomain = smtpUser.split("@")[1]?.toLowerCase() || "";
      const isZoho = ["zoho.com", "zohomail.com", "zoho.in", "zohomail.in"].includes(emailDomain);
      let transporter;
      
      if (isZoho) {
        const host = emailDomain.endsWith(".in") ? "smtp.zoho.in" : "smtp.zoho.com";
        transporter = nodemailer.createTransport({
          host,
          port: 465,
          secure: true,
          connectionTimeout: 1500,
          greetingTimeout: 1500,
          socketTimeout: 2000,
          auth: { user: smtpUser, pass: smtpPassword },
        });
      } else {
        transporter = nodemailer.createTransport({
          service: "gmail",
          connectionTimeout: 1500,
          greetingTimeout: 1500,
          socketTimeout: 2000,
          auth: { user: smtpUser, pass: smtpPassword },
        });
      }
      
      const verifyPromise = transporter.verify();
      const verifyResult = await withTimeout(verifyPromise, 2000, "TIMEOUT");
      if (verifyResult === "TIMEOUT") {
        throw new Error("Timeout");
      }
      mailerLatency = Date.now() - mailerStart;
    } catch (err) {
      mailerStatus = "degraded";
      mailerLatency = Date.now() - mailerStart;
    }
  }

  // Aggregate Overall Status (Sleek professional aggregation based on core operational systems)
  let overallStatus = "operational";
  if (dbStatus === "outage" || authStatus === "outage") {
    overallStatus = "major-outage";
  } else if (dbStatus === "degraded" || authStatus === "degraded") {
    overallStatus = "degraded-performance";
  }

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services: {
      database: {
        name: "Database (PostgreSQL)",
        status: dbStatus,
        latency: dbLatency,
      },
      auth: {
        name: "Auth Service (GoTrue)",
        status: authStatus,
        latency: authLatency,
      },
      storage: {
        name: "Object Storage",
        status: storageStatus,
        latency: storageLatency,
      },
      cron: {
        name: "Background Scheduler (pg_cron)",
        status: cronStatus,
        latency: cronLatency,
      },
      mailer: {
        name: "Notification Dispatcher (SMTP)",
        status: mailerStatus,
        latency: mailerLatency,
      }
    }
  });
}
