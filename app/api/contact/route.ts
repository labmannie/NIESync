import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { sendContactMessageEmail } from "@/lib/mailer";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

export async function POST(request: NextRequest) {
  // 5 submissions per 10 minutes per IP is generous for a real visitor and tight
  // enough to make automated spam/abuse impractical.
  const limited = await enforceRateLimit(request, {
    name: "contact",
    requests: 5,
    windowSeconds: 10 * 60,
  });
  if (limited) return limited;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request body.");
  }

  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim();
  const subject = String(body?.subject || "").trim();
  const message = String(body?.message || "").trim();

  if (!name || name.length > 120) {
    return badRequest("Please provide your name.");
  }
  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return badRequest("Please provide a valid email address.");
  }
  if (!subject || subject.length > 200) {
    return badRequest("Please provide a subject.");
  }
  if (!message || message.length > 5000) {
    return badRequest("Please provide a message (up to 5000 characters).");
  }

  try {
    const supabase = await createClient();
    const { error: insertError } = await supabase.from("contact_messages").insert({
      name,
      email,
      subject,
      message,
    });

    if (insertError) {
      console.error("Failed to store contact message:", insertError);
      return NextResponse.json(
        { success: false, error: "Unable to submit your message right now. Please try again shortly." },
        { status: 500 }
      );
    }

    // Best-effort notification email — the message is already safely stored even
    // if this fails (e.g. SMTP misconfigured), so we don't fail the request.
    try {
      await sendContactMessageEmail({ name, email, subject, message });
    } catch (emailError) {
      console.error("Failed to send contact notification email:", emailError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { success: false, error: "Unable to submit your message right now. Please try again shortly." },
      { status: 500 }
    );
  }
}
