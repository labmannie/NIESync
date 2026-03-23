import nodemailer from "nodemailer";
import { existsSync } from "fs";
import path from "path";

type SendParkingEmailInput = {
  toEmail: string;
  ownerName?: string | null;
  plate: string;
  location: string;
  resolveUrl: string;
  photoUrl?: string | null;
};

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedFallbackTransporter: nodemailer.Transporter | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

type TransportPlan = {
  user: string;
  primary: Record<string, unknown>;
  fallback?: Record<string, unknown>;
};

function getZohoSmtpHost(emailDomain: string) {
  if (emailDomain.endsWith(".in")) {
    return "smtp.zoho.in";
  }
  return "smtp.zoho.com";
}

function resolveTransportPlan(): TransportPlan {
  const smtpUser = requireEnv("GMAIL_USER").trim();
  const smtpPassword = requireEnv("GMAIL_APP_PASSWORD").trim();
  const emailDomain = smtpUser.split("@")[1]?.toLowerCase() || "";

  if (emailDomain === "gmail.com" || emailDomain === "googlemail.com") {
    return {
      user: smtpUser,
      primary: {
        service: "gmail",
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      },
    };
  }

  if (
    emailDomain === "zoho.com" ||
    emailDomain === "zohomail.com" ||
    emailDomain === "zoho.in" ||
    emailDomain === "zohomail.in"
  ) {
    const primaryHost = getZohoSmtpHost(emailDomain);
    const fallbackHost = primaryHost === "smtp.zoho.in" ? "smtp.zoho.com" : "smtp.zoho.in";

    return {
      user: smtpUser,
      primary: {
        host: primaryHost,
        port: 465,
        secure: true,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      },
      fallback: {
        host: fallbackHost,
        port: 465,
        secure: true,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      },
    };
  }

  return {
    user: smtpUser,
    primary: {
      host: `smtp.${emailDomain}`,
      port: 465,
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    },
  };
}

function getTransporters() {
  const plan = resolveTransportPlan();

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport(plan.primary as any);
  }

  if (plan.fallback && !cachedFallbackTransporter) {
    cachedFallbackTransporter = nodemailer.createTransport(plan.fallback as any);
  }

  const fallbackTransporter = plan.fallback ? cachedFallbackTransporter : null;

  return {
    user: plan.user,
    primary: cachedTransporter,
    fallback: fallbackTransporter,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveLogoAttachment() {
  const logoPath = path.join(process.cwd(), "public", "logo.png");
  if (!existsSync(logoPath)) return null;

  return {
    filename: "nie-sync-logo.png",
    path: logoPath,
    cid: "nie-sync-logo",
  };
}

export async function sendParkingEmail({
  toEmail,
  ownerName,
  plate,
  location,
  resolveUrl,
  photoUrl,
}: SendParkingEmailInput) {
  const safeName = escapeHtml((ownerName || "Vehicle Owner").trim() || "Vehicle Owner");
  const safePlate = escapeHtml(plate.trim());
  const safeLocation = escapeHtml(location.trim());
  const safeResolveUrl = escapeHtml(resolveUrl);
  const safePhotoUrl = escapeHtml(String(photoUrl || "").trim());
  const logoAttachment = resolveLogoAttachment();
  const logoMarkup = logoAttachment
    ? `<img src="cid:${logoAttachment.cid}" width="56" height="56" alt="NIE Sync" style="display:block;width:56px;height:56px;border-radius:12px;border:0;outline:none;text-decoration:none;" />`
    : `<img src="https://niesync.vercel.app/logo.png" width="56" height="56" alt="NIE Sync" style="display:block;width:56px;height:56px;border-radius:12px;border:0;outline:none;text-decoration:none;" />`;

  const subject = "NIE Sync | Parking Report Action Required";
  const { user: smtpUser, primary, fallback } = getTransporters();
  const preferredFrom = process.env.PARKING_FROM_EMAIL || `NIE Campus Sync <${smtpUser}>`;
  const authenticatedFrom = `NIE Campus Sync <${smtpUser}>`;
  const photoSection = safePhotoUrl
    ? `
                <tr>
                  <td style="padding:14px 28px 0;">
                    <p class="muted" style="margin:0 0 8px;font-size:11px;line-height:1.5;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#586274;">Incident photo</p>
                    <img src="${safePhotoUrl}" alt="Reported incident photo" style="display:block;max-width:100%;height:auto;border-radius:12px;border:1px solid #e5eaf3;" />
                  </td>
                </tr>
      `
    : "";

  const html = `
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
          }
        </style>
      </head>
      <body class="email-bg" style="margin:0;padding:0;background:#f4f6fb;font-family:'Rubik','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;">
          <tr>
            <td align="center">
              <table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dbe1ec;border-radius:18px;overflow:hidden;">
                <tr>
                  <td style="padding:28px 28px 18px;background:#050505;">
                    <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                      <tr>
                        <td style="width:64px;vertical-align:top;">
                          ${logoMarkup}
                        </td>
                        <td style="vertical-align:middle;">
                          <p style="margin:0;font-size:11px;line-height:1.4;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#FFB000;">NIE Sync</p>
                          <p style="margin:6px 0 0;font-size:17px;line-height:1.35;font-weight:800;color:#ffffff;">Parking Escalation</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 28px 10px;">
                    <h1 class="title" style="margin:0;font-size:24px;line-height:1.3;font-weight:800;color:#111827;">Action required for your vehicle</h1>
                    <p class="body-text" style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#1f2937;">Hello ${safeName}, your vehicle has been reported as blocking movement on campus. Please move it and confirm immediately.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 28px 0;">
                    <table class="soft-panel" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e5eaf3;border-radius:12px;">
                      <tr>
                        <td style="padding:12px 14px;border-bottom:1px solid #e5eaf3;">
                          <p class="muted" style="margin:0;font-size:11px;line-height:1.5;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#586274;">Vehicle plate</p>
                          <p class="body-text" style="margin:4px 0 0;font-size:18px;line-height:1.4;font-weight:900;color:#111827;">${safePlate}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 14px;">
                          <p class="muted" style="margin:0;font-size:11px;line-height:1.5;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#586274;">Location reported</p>
                          <p class="body-text" style="margin:4px 0 0;font-size:15px;line-height:1.65;font-weight:600;color:#1f2937;">${safeLocation}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${photoSection}
                <tr>
                  <td style="padding:18px 28px 0;">
                    <a href="${safeResolveUrl}" style="display:inline-block;padding:13px 22px;border-radius:10px;background:#FFB000;color:#050505;font-size:14px;font-weight:900;letter-spacing:.01em;text-decoration:none;">Confirm Vehicle Moved</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 28px 28px;">
                    <p class="muted" style="margin:0;font-size:12px;line-height:1.65;color:#5b6473;">If the button does not open, paste this secure link in your browser:</p>
                    <p style="margin:6px 0 0;font-size:12px;line-height:1.65;word-break:break-all;color:#2563EB;">${safeResolveUrl}</p>
                    <p class="muted" style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#7b8494;">Automated parking notification from NIE Sync.</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-top:1px solid #e5eaf3;">
                      <tr>
                        <td style="padding-top:12px;">
                          <p class="muted" style="margin:0;font-size:11px;line-height:1.7;color:#7b8494;">
                            Need help? See our
                            <a href="https://niesync.vercel.app/faq" style="color:#2563EB;text-decoration:none;">FAQ</a>.
                          </p>
                          <p class="muted" style="margin:6px 0 0;font-size:11px;line-height:1.7;color:#7b8494;">
                            Copyright 2026 NIE Sync. All rights reserved.
                          </p>
                          <p style="margin:6px 0 0;font-size:11px;line-height:1.7;">
                            <a href="https://niesync.vercel.app/terms-of-service" style="color:#2563EB;text-decoration:none;">Terms of Service</a>
                            <span class="muted" style="color:#9ca3af;"> | </span>
                            <a href="https://niesync.vercel.app/privacy-policy" style="color:#2563EB;text-decoration:none;">Privacy Policy</a>
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
      </body>
    </html>
  `.trim();

  const attachments = logoAttachment ? [logoAttachment] : [];
  let lastError: unknown = null;

  const sendUsingTransporter = async (transporter: nodemailer.Transporter) => {
    try {
      await transporter.sendMail({
        from: preferredFrom,
        to: toEmail,
        subject,
        html,
        attachments,
      });
      return true;
    } catch (error) {
      lastError = error;
    }

    if (preferredFrom !== authenticatedFrom) {
      try {
        await transporter.sendMail({
          from: authenticatedFrom,
          to: toEmail,
          subject,
          html,
          attachments,
        });
        return true;
      } catch (error) {
        lastError = error;
      }
    }

    return false;
  };

  const sentWithPrimary = await sendUsingTransporter(primary);
  if (sentWithPrimary) return;

  if (fallback && fallback !== primary) {
    const sentWithFallback = await sendUsingTransporter(fallback);
    if (sentWithFallback) return;
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Unable to deliver parking escalation email.");
}
