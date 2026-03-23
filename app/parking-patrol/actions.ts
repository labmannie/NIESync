"use server";

import { randomUUID } from "crypto";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { normalizeParkingReportPlateForSubmission } from "@/lib/vehiclePlate";

const INCIDENT_PHOTOS_BUCKET = "incident-photos";
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
  return message || "Unable to submit report right now.";
}

function mapThreadActionError(message: string) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("chat window closed")) {
    return "Chat window is closed for this report. Please use escalation actions.";
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

  const normalizedPlate = normalizeParkingReportPlateForSubmission({
    manualPlate,
    ocrRawText,
  });

  if (normalizedPlate.error) {
    return { ok: false, error: normalizedPlate.error };
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

export async function sendParkingMessageAction(
  reportId: string,
  message: string
): Promise<BasicActionResult> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("parking_add_message", {
    _report_id: reportId,
    _message: message,
  });

  if (error) return { ok: false, error: mapThreadActionError(error.message || "Unable to send message.") };
  return { ok: true };
}

export async function ownerImMovingAction(reportId: string): Promise<BasicActionResult> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("parking_owner_im_moving", {
    _report_id: reportId,
  });

  if (error) return { ok: false, error: mapThreadActionError(error.message || "Unable to acknowledge movement.") };
  return { ok: true };
}

export async function reporterMarkResolvedAction(reportId: string): Promise<BasicActionResult> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("parking_reporter_mark_resolved", {
    _report_id: reportId,
  });

  if (error) return { ok: false, error: mapThreadActionError(error.message || "Unable to resolve report.") };
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
