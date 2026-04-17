import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/utils/supabase/server";
import nodemailer from "nodemailer";
import { existsSync } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ── Helpers ── */

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTransporter() {
  const smtpUser = String(process.env.GMAIL_USER || "").trim();
  const smtpPassword = String(process.env.GMAIL_APP_PASSWORD || "").trim();

  if (!smtpUser || !smtpPassword) {
    throw new Error("SMTP configuration missing.");
  }

  const emailDomain = smtpUser.split("@")[1]?.toLowerCase() || "";
  const isZoho =
    emailDomain === "zoho.com" ||
    emailDomain === "zohomail.com" ||
    emailDomain === "zoho.in" ||
    emailDomain === "zohomail.in";

  if (isZoho) {
    const host = emailDomain.endsWith(".in") ? "smtp.zoho.in" : "smtp.zoho.com";
    return nodemailer.createTransport({
      host,
      port: 465,
      secure: true,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
      auth: { user: smtpUser, pass: smtpPassword },
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: smtpUser, pass: smtpPassword },
  });
}

/* ── Email HTML Builder ── */

function buildWelcomeEmailHtml(
  firstName: string,
  hasLogo: boolean
): string {
  const safeName = escapeHtml(firstName);
  const currentYear = new Date().getFullYear();

  const logoMarkup = hasLogo
    ? `<img src="cid:nie-sync-logo" width="56" height="56" alt="NIE Sync" style="display:block;width:56px;height:56px;border-radius:12px;border:0;outline:none;text-decoration:none;" />`
    : `<img src="https://niesync.vercel.app/logo.png" width="56" height="56" alt="NIE Sync" style="display:block;width:56px;height:56px;border-radius:12px;border:0;outline:none;text-decoration:none;" />`;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>
          @media (prefers-color-scheme: dark) {
            .email-bg { background:#020202 !important; }
            .email-card { background:#0a0a0a !important; border-color:#2a2a2a !important; }
            .soft-panel { background:#111111 !important; border-color:#2a2a2a !important; }
            .title, .body-text { color:#f5f5f5 !important; }
            .muted { color:#b6b6bc !important; }
            .cta-btn { background:#2563EB !important; }
          }
        </style>
      </head>
      <body class="email-bg" style="margin:0;padding:0;background:#f4f6fb;font-family:'Rubik','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;">
          <tr>
            <td align="center">
              <table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dbe1ec;border-radius:18px;overflow:hidden;">

                <!-- Header -->
                <tr>
                  <td style="padding:28px 28px 18px;background:#050505;">
                    <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                      <tr>
                        <td style="width:64px;vertical-align:top;">
                          ${logoMarkup}
                        </td>
                        <td style="vertical-align:middle;">
                          <p style="margin:0;font-size:11px;line-height:1.4;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#FFB000;">NIE Sync</p>
                          <p style="margin:6px 0 0;font-size:17px;line-height:1.35;font-weight:800;color:#ffffff;">Welcome to the Campus</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:28px 28px 6px;">
                    <h1 class="title" style="margin:0;font-size:24px;line-height:1.3;font-weight:800;color:#111827;">You're in, ${safeName}. 🎉</h1>
                    <p class="body-text" style="margin:16px 0 0;font-size:15px;line-height:1.7;color:#1f2937;">
                      Your profile is set up and you now have full access to NIE Sync — the unified platform built exclusively for the NIE campus community.
                    </p>
                  </td>
                </tr>

                <!-- Value Bullets -->
                <tr>
                  <td style="padding:12px 28px 4px;">
                    <table class="soft-panel" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e5eaf3;border-radius:12px;">
                      <tr>
                        <td style="padding:16px 18px;border-bottom:1px solid #e5eaf3;">
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="width:36px;vertical-align:top;padding-top:2px;">
                                <span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;background:#2563EB;border-radius:8px;font-size:14px;">🔍</span>
                              </td>
                              <td style="padding-left:10px;">
                                <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">Lost & Found</p>
                                <p class="muted" style="margin:3px 0 0;font-size:12.5px;line-height:1.55;color:#586274;">Report lost items or help reunite found belongings with their owners — instantly.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:16px 18px;border-bottom:1px solid #e5eaf3;">
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="width:36px;vertical-align:top;padding-top:2px;">
                                <span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;background:#FFB000;border-radius:8px;font-size:14px;">🚗</span>
                              </td>
                              <td style="padding-left:10px;">
                                <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">Parking Patrol</p>
                                <p class="muted" style="margin:3px 0 0;font-size:12.5px;line-height:1.55;color:#586274;">Spot a parking violation, scan the plate, and the system handles the rest via real-time chat.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:16px 18px;">
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="width:36px;vertical-align:top;padding-top:2px;">
                                <span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;background:#22c55e;border-radius:8px;font-size:14px;">💬</span>
                              </td>
                              <td style="padding-left:10px;">
                                <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">Campus Forum</p>
                                <p class="muted" style="margin:3px 0 0;font-size:12.5px;line-height:1.55;color:#586274;">Discuss events, ask for help, rant safely — your anonymous campus community hub.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- CTA Button -->
                <tr>
                  <td style="padding:22px 28px 8px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                      <tr>
                        <td align="center">
                          <a class="cta-btn" href="https://niesync.vercel.app/lost-and-found" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#2563EB;color:#ffffff;font-size:15px;font-weight:800;letter-spacing:.02em;text-decoration:none;padding:14px 42px;border-radius:12px;mso-padding-alt:0;text-align:center;">
                            <!--[if mso]><i style="mso-font-width:-100%;mso-text-raise:21pt">&nbsp;</i><![endif]-->
                            <span style="mso-text-raise:10pt;">Open NIE Sync →</span>
                            <!--[if mso]><i style="mso-font-width:-100%">&nbsp;</i><![endif]-->
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Subtle social proof -->
                <tr>
                  <td style="padding:14px 28px 4px;" align="center">
                    <p class="muted" style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;font-style:italic;">
                      Join your fellow NIE students already using the platform every day.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:18px 28px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e5eaf3;">
                      <tr>
                        <td style="padding-top:16px;">
                          <p class="muted" style="margin:0;font-size:12px;line-height:1.65;color:#5b6473;">
                            This is a one-time welcome email sent after completing your profile.
                          </p>
                          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px 14px;margin-top:12px;">
                            <p style="margin:0;font-size:11.5px;line-height:1.6;color:#991b1b;font-weight:700;">
                              ⛔ This is an automated, no-reply email. Please do not reply.
                            </p>
                            <p style="margin:3px 0 0;font-size:11px;line-height:1.6;color:#991b1b;">
                              Questions? <a href="https://niesync.vercel.app/contact" style="color:#2563EB;text-decoration:none;font-weight:600;">Contact us here</a>.
                            </p>
                          </div>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;">
                            <tr>
                              <td>
                                <p class="muted" style="margin:0;font-size:11px;line-height:1.7;color:#7b8494;">
                                  Need help?
                                  <a href="https://niesync.vercel.app/faq" style="color:#2563EB;text-decoration:none;font-weight:600;">FAQ</a>
                                  &nbsp;·&nbsp;
                                  <a href="https://niesync.vercel.app/contact" style="color:#2563EB;text-decoration:none;font-weight:600;">Contact Support</a>
                                </p>
                                <p class="muted" style="margin:6px 0 0;font-size:11px;line-height:1.7;color:#7b8494;">
                                  © ${currentYear} NIE Campus Sync. All rights reserved.
                                </p>
                                <p style="margin:6px 0 0;font-size:11px;line-height:1.7;">
                                  <a href="https://niesync.vercel.app/terms-of-service" style="color:#2563EB;text-decoration:none;">Terms of Service</a>
                                  <span class="muted" style="color:#9ca3af;"> · </span>
                                  <a href="https://niesync.vercel.app/privacy-policy" style="color:#2563EB;text-decoration:none;">Privacy Policy</a>
                                </p>
                                <p class="muted" style="margin:10px 0 0;font-size:10px;line-height:1.5;color:#9ca3af;">
                                  NIE Sync · The National Institute of Engineering, Mysuru, Karnataka, India
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `.trim();
}

/* ── Route Handler ── */

export async function POST() {
  try {
    const supabase = await createServerClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const user = userData.user;
    const userEmail = String(user.email || "").trim();

    if (!userEmail) {
      return NextResponse.json(
        { error: "No email on account." },
        { status: 400 }
      );
    }

    // Fetch profile for name
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();

    const firstName = String(profile?.first_name || "").trim() || "there";

    // Build & send
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const hasLogo = existsSync(logoPath);

    const html = buildWelcomeEmailHtml(firstName, hasLogo);
    const transporter = getTransporter();
    const smtpUser = String(process.env.GMAIL_USER || "").trim();

    const attachments: any[] = [];
    if (hasLogo) {
      attachments.push({
        filename: "nie-sync-logo.png",
        path: logoPath,
        cid: "nie-sync-logo",
      });
    }

    await transporter.sendMail({
      from: `NIE Campus Sync <${smtpUser}>`,
      to: userEmail,
      subject: "Welcome to NIE Sync — You're all set",
      html,
      attachments,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Welcome email error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to send welcome email.",
      },
      { status: 500 }
    );
  }
}
