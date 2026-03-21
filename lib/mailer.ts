import nodemailer from "nodemailer";

type SendParkingEmailInput = {
  toEmail: string;
  ownerName?: string | null;
  plate: string;
  location: string;
  resolveUrl: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const gmailUser = requireEnv("GMAIL_USER");
  const gmailAppPassword = requireEnv("GMAIL_APP_PASSWORD");

  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });

  return cachedTransporter;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendParkingEmail({
  toEmail,
  ownerName,
  plate,
  location,
  resolveUrl,
}: SendParkingEmailInput) {
  const warningEmoji = "\u26A0\uFE0F";
  const checkEmoji = "\u2705";
  const safeName = escapeHtml((ownerName || "Vehicle Owner").trim() || "Vehicle Owner");
  const safePlate = escapeHtml(plate.trim());
  const safeLocation = escapeHtml(location.trim());
  const safeResolveUrl = escapeHtml(resolveUrl);

  const subject = `${warningEmoji} Action Required \u2014 Your Vehicle ${plate} is Blocking Traffic at NIE`;
  const from = process.env.PARKING_FROM_EMAIL || `NIE Campus Sync <${requireEnv("GMAIL_USER")}>`;

  const html = `
    <div style="background:#f3f6fb;padding:32px 12px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe5f2;border-radius:14px;overflow:hidden;">
        <tr>
          <td style="padding:28px 28px 18px;">
            <h1 style="margin:0;font-size:22px;line-height:1.35;font-weight:800;color:#0f172a;">
              ${warningEmoji} Action Required
            </h1>
            <p style="margin:10px 0 0;font-size:15px;line-height:1.7;color:#334155;">
              Hello ${safeName},
            </p>
            <p style="margin:10px 0 0;font-size:15px;line-height:1.7;color:#334155;">
              Your vehicle appears to be blocking traffic flow on campus. Please move it as soon as possible.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px;">
            <div style="border:1px solid #dbe5f2;background:#f8fbff;border-radius:10px;padding:14px 16px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.02em;color:#475569;">Reported Vehicle</p>
              <p style="margin:0;font-size:16px;font-weight:800;color:#0f172a;">${safePlate}</p>
              <p style="margin:12px 0 0;font-size:13px;font-weight:700;letter-spacing:.02em;color:#475569;">Location</p>
              <p style="margin:0;font-size:15px;font-weight:600;color:#0f172a;">${safeLocation}</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 28px 8px;">
            <a href="${safeResolveUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:800;letter-spacing:.01em;">
              ${checkEmoji} I've Moved My Vehicle
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 28px 26px;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
              This is an automated message from NIE Campus Sync.
            </p>
          </td>
        </tr>
      </table>
    </div>
  `.trim();

  const text = [
    `Hello ${ownerName?.trim() || "Vehicle Owner"},`,
    "",
    `Your vehicle ${plate} has been reported as blocking traffic near ${location}.`,
    "Please confirm once you have moved your vehicle:",
    resolveUrl,
    "",
    "This is an automated message from NIE Campus Sync.",
  ].join("\n");

  await getTransporter().sendMail({
    from,
    to: toEmail,
    subject,
    html,
    text,
  });
}
