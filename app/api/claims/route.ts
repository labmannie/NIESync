import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendLostAndFoundEmail } from "@/lib/mailer";
import { enforceRateLimit } from "@/lib/rateLimit";
import { canSubmitClaim, canUpdateClaimStatus, isValidClaimStatus } from "@/lib/claimsPermissions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { itemId, message, phone } = body;

    if (!itemId) {
      return NextResponse.json({ success: false, error: "Item ID is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = userData.user.id;

    // 10 claims per 10 minutes per user is well above realistic legitimate use,
    // and blocks a script from spamming every open item with claims.
    const limited = await enforceRateLimit(req, {
      name: "claims-post",
      requests: 10,
      windowSeconds: 10 * 60,
      identifier: userId,
    });
    if (limited) return limited;

    // Fetch item details and reporter details
    const { data: item, error: itemError } = await supabase
      .from("lost_and_found_reports")
      .select("*, profiles!reporter_id(first_name, last_name)")
      .eq("id", itemId)
      .single();

    if (itemError || !item) {
      return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    }

    if (!canSubmitClaim(item, userId)) {
      return NextResponse.json({ success: false, error: "You cannot claim your own item" }, { status: 400 });
    }

    // Insert the claim
    const { error: insertError } = await supabase
      .from("lost_and_found_claims")
      .insert([
        {
          report_id: itemId,
          claimer_id: userId,
          message: message || null,
          phone_number: phone || null,
          status: "pending",
        },
      ]);

    if (insertError) {
      if (insertError.code === "23505") { // Unique violation
        return NextResponse.json({ success: false, error: "You have already submitted a claim for this item." }, { status: 400 });
      }
      console.error("Error inserting claim:", insertError);
      return NextResponse.json({ success: false, error: "Failed to submit claim" }, { status: 500 });
    }

    // Fetch reporter's email via admin client
    const adminClient = createAdminClient();
    const { data: reporterAuth } = await adminClient.auth.admin.getUserById(item.reporter_id);
    const reporterEmail = reporterAuth?.user?.email;

    // Send email to the reporter
    if (reporterEmail) {
      // Fetch claimer's name and email
      const { data: claimerProfile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", userId)
        .single();

      const { data: claimerAuth } = await adminClient.auth.admin.getUserById(userId);
      const claimerEmail = claimerAuth?.user?.email;

      const reporterName = item.profiles ? `${item.profiles.first_name || ''} ${item.profiles.last_name || ''}`.trim() : "User";
      const claimerName = claimerProfile ? `${claimerProfile.first_name || ''} ${claimerProfile.last_name || ''}`.trim() : "A user";

      try {
        await sendLostAndFoundEmail({
          toEmail: reporterEmail,
          reporterName: reporterName || "User",
          itemName: item.title,
          claimerName: claimerName || "A user",
          claimerEmail: claimerEmail || null,
          claimMessage: message || "No additional message.",
          claimPhone: phone,
          itemType: item.type,
        });
      } catch (emailErr) {
        console.error("Failed to send claim email:", emailErr);
        // We don't return an error here, since the claim was successfully created
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("API Error in claims/route.ts:", err);
    return NextResponse.json({ success: false, error: err.message || "Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { claimId, status } = body;

    if (!claimId || !status) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    if (!isValidClaimStatus(status)) {
      return NextResponse.json({ success: false, error: "Invalid status value" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = userData.user.id;

    const limited = await enforceRateLimit(req, {
      name: "claims-patch",
      requests: 30,
      windowSeconds: 10 * 60,
      identifier: userId,
    });
    if (limited) return limited;

    // Verify ownership of the item this claim belongs to
    const { data: claim, error: claimError } = await supabase
      .from("lost_and_found_claims")
      .select("*, lost_and_found_reports(reporter_id)")
      .eq("id", claimId)
      .single();

    if (claimError || !claim) {
      return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
    }

    if (!canUpdateClaimStatus(claim, userId)) {
      return NextResponse.json({ success: false, error: "Unauthorized to update this claim" }, { status: 403 });
    }

    const { error: updateError } = await supabase
      .from("lost_and_found_claims")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", claimId);

    if (updateError) {
      return NextResponse.json({ success: false, error: "Failed to update claim" }, { status: 500 });
    }

    // Optional: Send email to the claimer that their claim was accepted/rejected

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("API Error in claims route patch:", err);
    return NextResponse.json({ success: false, error: err.message || "Server Error" }, { status: 500 });
  }
}
