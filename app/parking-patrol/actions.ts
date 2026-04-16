
"use server";

import { randomUUID } from "crypto";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { normalizeParkingReportPlateForSubmission } from "@/lib/vehiclePlate";
import { runParkingEscalation } from "@/lib/parkingEscalation";
import {
  CHAT_MODERATION_BLOCK_MESSAGE,
  hasProfanity,
  sanitizeChatMessage,
} from "@/lib/chatModeration";

const INCIDENT_PHOTOS_BUCKET = "incident-photos";
const LOCATION_DESCRIPTION_MAX_LENGTH = 180;
const PLATE_RECOGNIZER_API_URL = "https://api.platerecognizer.com/v1/plate-reader/";
const PLATE_RECOGNIZER_TIMEOUT_MS = 15000;
const INCIDENT_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

type BasicActionResult = {
  ok: boolean;
  error?: string;
};

function normalizePlateKey(value: string) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function mapReportSubmissionError(message: string) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("max 3 reports in 2 hours")) {
    return "Rate limit hit: max 3 reports in a rolling 2-hour window.";
  }
  if (normalized.includes("max 2 reports per plate in 24 hours")) {
    return "Rate limit hit: this vehicle already has 2 reports in the last 24 hours.";
  }
  if (normalized.includes("already have an open parking report")) {
    return "You already have one unresolved active report. Resolve it before creating a new one.";
  }
  if (normalized.includes("cannot report your own vehicle")) {
    return "You cannot report your own registered vehicle.";
  }
  return message || "Unable to submit report right now.";
}

function mapThreadActionError(message: string) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("chat window closed after phone reveal")) {
    return "Chat closes after the reporter reveals and calls the owner.";
  }
  if (normalized.includes("chat window closed")) {
    return "Chat is closed for this report.";
  }
  if (normalized.includes("chat is disabled for unmatched reports")) {
    return "Chat is not available for unmatched reports.";
  }
  if (normalized.includes("cannot be resolved at this stage")) {
    return "You can resolve after owner acknowledgement, or after owner phone is revealed in email escalation stage.";
  }
  if (normalized.includes("can be marked unresolved only 5 minutes")) {
    return "You can mark unresolved only after 5 minutes from owner acknowledgement.";
  }
  if (normalized.includes("report cannot be marked unresolved")) {
    return "This report cannot be marked unresolved right now.";
  }
  if (normalized.includes("reopened at most 2 times")) {
    return "You have reached the reopen limit for this report (max 2 times).";
  }
  if (normalized.includes("report can be cancelled only during first minute")) {
    return "You can cancel only during Stage 1 (the first 1 minute).";
  }
  if (normalized.includes("report cannot be cancelled")) {
    return "This report cannot be cancelled right now.";
  }
  return message || "Unable to complete this action.";
}

function inferExtension(file: File) {
  const fileName = String(file.name || "");
  const fromName = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : "";
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;

  const mime = String(file.type || "");
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("heic")) return "heic";
  return "jpg";
}

async function ensureIncidentPhotosBucket() {
  const admin = createAdminClient();
  const { data: buckets, error: bucketsError } = await admin.storage.listBuckets();
  if (bucketsError) {
    throw new Error(bucketsError.message || "Unable to verify storage bucket.");
  }

  const bucketConfig = {
    public: false,
    fileSizeLimit: "10MB",
    allowedMimeTypes: INCIDENT_PHOTO_MIME_TYPES,
  };

  const exists = (buckets || []).some((bucket) => bucket.name === INCIDENT_PHOTOS_BUCKET);
  if (exists) {
    const { error: updateError } = await admin.storage.updateBucket(INCIDENT_PHOTOS_BUCKET, bucketConfig);
    if (updateError) {
      throw new Error(updateError.message || "Unable to update incident photo bucket settings.");
    }
    return;
  }

  const { error: createError } = await admin.storage.createBucket(INCIDENT_PHOTOS_BUCKET, bucketConfig);

  if (createError && !String(createError.message || "").toLowerCase().includes("already exists")) {
    throw new Error(createError.message || "Unable to create incident photo bucket.");
  }
}

async function uploadIncidentPhoto(userId: string, imageFile: File) {
  await ensureIncidentPhotosBucket();
  const admin = createAdminClient();

  const extension = inferExtension(imageFile);
  const path = `${userId}/${Date.now()}-${randomUUID()}.${extension}`;

  const imageBytes = new Uint8Array(await imageFile.arrayBuffer());
  const { data, error } = await admin.storage
    .from(INCIDENT_PHOTOS_BUCKET)
    .upload(path, imageBytes, {
      contentType: imageFile.type || "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(error.message || "Photo upload failed.");
  }

  return data?.path || path;
}

function resolvePlateRecognizerToken() {
  return String(
    process.env.PLATE_RECOGNIZER_API_TOKEN || process.env.PLATE_RECOGNIZER_TOKEN || ""
  ).trim();
}

function resolveAppBaseUrl(clientBaseUrl?: string) {
  const fromClient = String(clientBaseUrl || "").trim();
  if (fromClient) {
    return fromClient.replace(/\/$/, "");
  }

  const configured = String(
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || ""
  ).trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const vercelUrl = String(process.env.VERCEL_URL || "").trim().replace(/\/$/, "");
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return "";
}

export async function getParkingIncidentPhotoUrlAction(
  photoPath: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const normalizedPath = String(photoPath || "").trim();
  if (!normalizedPath) {
    return { ok: false, error: "Photo path is missing." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(INCIDENT_PHOTOS_BUCKET)
    .createSignedUrl(normalizedPath, 60 * 60);

  if (error) {
    return { ok: false, error: error.message || "Unable to generate photo URL." };
  }

  return { ok: true, url: String(data?.signedUrl || "") };
}

export async function detectParkingPlateFromPhotoAction(
  formData: FormData
): Promise<{ ok: boolean; plate?: string; rawText?: string; error?: string }> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "You must be logged in to detect a number plate." };
  }

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size <= 0) {
    return { ok: false, error: "Please upload a valid incident photo first." };
  }

  const apiToken = resolvePlateRecognizerToken();
  if (!apiToken) {
    return {
      ok: false,
      error:
        "Plate recognizer is not configured. Missing PLATE_RECOGNIZER_API_TOKEN in environment variables.",
    };
  }

  const requestBody = new FormData();
  requestBody.append("upload", photo);
  requestBody.append("regions", "in");
  requestBody.append("config", JSON.stringify({ region: "strict" }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PLATE_RECOGNIZER_TIMEOUT_MS);

  try {
    const response = await fetch(PLATE_RECOGNIZER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiToken}`,
      },
      body: requestBody,
      signal: controller.signal,
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const apiError =
        String(payload?.error || payload?.message || payload?.detail || "").trim() ||
        `API request failed with status ${response.status}.`;
      return { ok: false, error: `Plate recognizer error: ${apiError}` };
    }

    const results = Array.isArray(payload?.results) ? payload.results : [];
    if (results.length === 0) {
      return {
        ok: false,
        error: "No clear number plate was detected. Try a closer, sharper image or enter manually.",
      };
    }

    const rankedResults = [...results].sort(
      (a, b) => Number(b?.score || 0) - Number(a?.score || 0)
    );
    const bestResult = rankedResults[0];
    const bestPlate = String(
      bestResult?.plate ||
        (Array.isArray(bestResult?.candidates) ? bestResult.candidates[0]?.plate : "") ||
        ""
    )
      .trim()
      .toUpperCase();

    if (!bestPlate) {
      return {
        ok: false,
        error: "Detected plate text was empty. Please enter the plate manually.",
      };
    }

    const candidateText = Array.isArray(bestResult?.candidates)
      ? bestResult.candidates
          .map((candidate: any) => String(candidate?.plate || "").trim().toUpperCase())
          .filter(Boolean)
          .join(" ")
      : "";

    return {
      ok: true,
      plate: bestPlate,
      rawText: candidateText || bestPlate,
    };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return {
        ok: false,
        error: `Plate recognizer timed out after ${PLATE_RECOGNIZER_TIMEOUT_MS}ms.`,
      };
    }
    return {
      ok: false,
      error: String(error?.message || "Unable to process photo with plate recognizer."),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function submitParkingReportAction(
  formData: FormData
): Promise<BasicActionResult & { reportId?: string; unmatched?: boolean; plate?: string }> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "You must be logged in to submit a parking report." };
  }

  const photo = formData.get("photo");
  const locationDescription = String(formData.get("location_description") || "").trim();
  const manualPlate = String(formData.get("plate_input") || "");
  const ocrRawText = String(formData.get("ocr_raw_text") || "");
  const hasPhoto = photo instanceof File && photo.size > 0;

  if (!locationDescription) {
    return { ok: false, error: "Location description is required." };
  }

  if (locationDescription.length > LOCATION_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      error: `Location description must be ${LOCATION_DESCRIPTION_MAX_LENGTH} characters or less.`,
    };
  }

  const normalizedPlate = normalizeParkingReportPlateForSubmission({
    manualPlate,
    ocrRawText,
  });

  if (normalizedPlate.error) {
    return { ok: false, error: normalizedPlate.error };
  }
  const targetPlateKey = normalizePlateKey(normalizedPlate.plate);

  try {
    const [{ data: ownProfile }, { data: ownExtraVehicles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("vehicle_no")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("profile_vehicles")
        .select("vehicle_no")
        .eq("profile_id", user.id)
        .limit(20),
    ]);

    const ownPlates = new Set<string>();
    const primaryVehicle = normalizePlateKey(String((ownProfile as any)?.vehicle_no || ""));
    if (primaryVehicle) ownPlates.add(primaryVehicle);

    ((ownExtraVehicles || []) as Array<{ vehicle_no?: string | null }>).forEach((row) => {
      const normalized = normalizePlateKey(String(row?.vehicle_no || ""));
      if (normalized) ownPlates.add(normalized);
    });

    if (targetPlateKey && ownPlates.has(targetPlateKey)) {
      return { ok: false, error: "You cannot report your own registered vehicle." };
    }
  } catch {
    // If profile vehicle lookup fails transiently, fallback to DB RPC guard.
  }

  let photoPath: string | null = null;
  if (hasPhoto) {
    try {
      photoPath = await uploadIncidentPhoto(user.id, photo);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to upload photo.",
      };
    }
  }

  const { data, error } = await supabase.rpc("parking_create_report", {
    _license_plate: normalizedPlate.plate,
    _location_description: locationDescription,
    _photo_url: photoPath,
    _ocr_raw_text: ocrRawText || null,
  });

  if (error) {
    return { ok: false, error: mapReportSubmissionError(error.message || "") };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    reportId: row?.id,
    unmatched: row?.status === "unmatched",
    plate: normalizedPlate.plate,
  };
}

/**
 * These mutation actions intentionally do not call revalidatePath().
 * The parking patrol surface is driven by Supabase Realtime subscriptions
 * plus optimistic client updates. For a live chat/timer UI, forcing a route
 * revalidation causes visible refreshes, focus loss, timer jitter, and scroll
 * jumps even though the page is already subscribed to the underlying tables.
 */
export async function sendParkingMessageAction(
  reportId: string,
  message: string
): Promise<BasicActionResult> {
  const normalizedMessage = sanitizeChatMessage(message);
  if (!normalizedMessage) {
    return { ok: false, error: "Message cannot be empty." };
  }

  if (hasProfanity(normalizedMessage)) {
    return { ok: false, error: CHAT_MODERATION_BLOCK_MESSAGE };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("parking_add_message", {
    _report_id: reportId,
    _message: normalizedMessage,
  });

  if (error) {
    return { ok: false, error: mapThreadActionError(error.message || "Unable to send message.") };
  }

  return { ok: true };
}

export async function ownerImMovingAction(reportId: string): Promise<BasicActionResult> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("parking_owner_im_moving", {
    _report_id: reportId,
  });

  if (error) {
    return { ok: false, error: mapThreadActionError(error.message || "Unable to acknowledge movement.") };
  }

  return { ok: true };
}

export async function reporterMarkResolvedAction(reportId: string): Promise<BasicActionResult> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("parking_reporter_mark_resolved", {
    _report_id: reportId,
  });

  if (error) {
    return { ok: false, error: mapThreadActionError(error.message || "Unable to resolve report.") };
  }

  return { ok: true };
}

export async function reporterMarkUnresolvedAction(reportId: string): Promise<BasicActionResult> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("parking_reporter_mark_unresolved", {
    _report_id: reportId,
  });

  if (error) {
    return {
      ok: false,
      error: mapThreadActionError(error.message || "Unable to reopen this report."),
    };
  }

  return { ok: true };
}

export async function reporterCancelReportAction(reportId: string): Promise<BasicActionResult> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("parking_reporter_cancel", {
    _report_id: reportId,
  });

  if (error) {
    return {
      ok: false,
      error: mapThreadActionError(error.message || "Unable to cancel this report."),
    };
  }

  return { ok: true };
}

export async function revealParkingPhoneAction(
  reportId: string
): Promise<BasicActionResult & { phone?: string }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("parking_reveal_phone", {
    _report_id: reportId,
  });

  if (error) {
    return { ok: false, error: error.message || "Phone reveal is not available yet." };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const phone = String(row?.phone || "");
  if (!phone) {
    return { ok: false, error: "Owner phone number is unavailable." };
  }

  return { ok: true, phone };
}

export async function triggerParkingEscalationAction(
  clientBaseUrl?: string
): Promise<BasicActionResult> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "You must be logged in to run escalation sync." };
  }

  const appBaseUrl = resolveAppBaseUrl(clientBaseUrl);
  if (!appBaseUrl) {
    return { ok: false, error: "APP URL is missing. Set NEXT_PUBLIC_APP_URL in environment." };
  }

  try {
    await runParkingEscalation(appBaseUrl);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Escalation sync failed.",
    };
  }
}
