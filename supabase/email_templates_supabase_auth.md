# NIE Sync Email Templates (Professional + Legal Footer Included)

Use these in Supabase Dashboard -> Authentication -> Email Templates.

Brand setup used:
- Domain: `https://niesync.vercel.app`
- Logo: `https://niesync.vercel.app/logo.png`
- Colors: campus black `#050505`, accent amber `#FFB000`, accent blue `#2563EB`
- Footer links: FAQ, Terms of Service, Privacy Policy
- Copyright line: `Copyright 2026 NIE Sync. All rights reserved.`

## 1) Subject: NIE Sync | Secure Access Link

```html
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
                      <img src="https://niesync.vercel.app/logo.png" width="56" height="56" alt="NIE Sync" style="display:block;width:56px;height:56px;border-radius:12px;border:0;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <p style="margin:0;font-size:11px;line-height:1.4;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#FFB000;">NIE Sync</p>
                      <p style="margin:6px 0 0;font-size:17px;line-height:1.35;font-weight:800;color:#ffffff;">Secure Access Link</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 10px;">
                <h1 class="title" style="margin:0;font-size:24px;line-height:1.3;font-weight:800;color:#111827;">Your sign-in link is ready</h1>
                <p class="body-text" style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#1f2937;">Use the button below to securely access your NIE Sync account.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 0;">
                <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 22px;border-radius:10px;background:#FFB000;color:#050505;font-size:14px;font-weight:900;letter-spacing:.01em;text-decoration:none;">Open NIE Sync</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 28px;">
                <table class="soft-panel" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e5eaf3;border-radius:12px;">
                  <tr>
                    <td style="padding:12px 14px;">
                      <p class="muted" style="margin:0;font-size:12px;line-height:1.65;color:#5b6473;">If the button does not open, paste this secure link in your browser:</p>
                      <p style="margin:6px 0 0;font-size:12px;line-height:1.65;word-break:break-all;color:#2563EB;">{{ .ConfirmationURL }}</p>
                    </td>
                  </tr>
                </table>
                <p class="muted" style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#7b8494;">If you did not request this, you can ignore this email.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-top:1px solid #e5eaf3;">
                  <tr>
                    <td style="padding-top:12px;">
                      <p class="muted" style="margin:0;font-size:11px;line-height:1.7;color:#7b8494;">Need help? See our <a href="https://niesync.vercel.app/faq" style="color:#2563EB;text-decoration:none;">FAQ</a>.</p>
                      <p class="muted" style="margin:6px 0 0;font-size:11px;line-height:1.7;color:#7b8494;">Copyright 2026 NIE Sync. All rights reserved.</p>
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
```

## 2) Subject: NIE Sync | Reset Your Password

```html
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
                      <img src="https://niesync.vercel.app/logo.png" width="56" height="56" alt="NIE Sync" style="display:block;width:56px;height:56px;border-radius:12px;border:0;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <p style="margin:0;font-size:11px;line-height:1.4;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#FFB000;">NIE Sync</p>
                      <p style="margin:6px 0 0;font-size:17px;line-height:1.35;font-weight:800;color:#ffffff;">Password Reset</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 10px;">
                <h1 class="title" style="margin:0;font-size:24px;line-height:1.3;font-weight:800;color:#111827;">Reset your password</h1>
                <p class="body-text" style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#1f2937;">A request was received to reset your NIE Sync password. Use the secure button below to continue.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 0;">
                <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 22px;border-radius:10px;background:#FFB000;color:#050505;font-size:14px;font-weight:900;letter-spacing:.01em;text-decoration:none;">Reset Password</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 28px;">
                <table class="soft-panel" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e5eaf3;border-radius:12px;">
                  <tr>
                    <td style="padding:12px 14px;">
                      <p class="muted" style="margin:0;font-size:12px;line-height:1.65;color:#5b6473;">If the button does not open, paste this secure link in your browser:</p>
                      <p style="margin:6px 0 0;font-size:12px;line-height:1.65;word-break:break-all;color:#2563EB;">{{ .ConfirmationURL }}</p>
                    </td>
                  </tr>
                </table>
                <p class="muted" style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#7b8494;">If you did not request this, you can ignore this email.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-top:1px solid #e5eaf3;">
                  <tr>
                    <td style="padding-top:12px;">
                      <p class="muted" style="margin:0;font-size:11px;line-height:1.7;color:#7b8494;">Need help? See our <a href="https://niesync.vercel.app/faq" style="color:#2563EB;text-decoration:none;">FAQ</a>.</p>
                      <p class="muted" style="margin:6px 0 0;font-size:11px;line-height:1.7;color:#7b8494;">Copyright 2026 NIE Sync. All rights reserved.</p>
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
```

## 3) Subject: NIE Sync | Password Changed Successfully

```html
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
                      <img src="https://niesync.vercel.app/logo.png" width="56" height="56" alt="NIE Sync" style="display:block;width:56px;height:56px;border-radius:12px;border:0;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <p style="margin:0;font-size:11px;line-height:1.4;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#FFB000;">NIE Sync</p>
                      <p style="margin:6px 0 0;font-size:17px;line-height:1.35;font-weight:800;color:#ffffff;">Security Update</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 12px;">
                <h1 class="title" style="margin:0;font-size:24px;line-height:1.3;font-weight:800;color:#111827;">Password changed successfully</h1>
                <p class="body-text" style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#1f2937;">This confirms your NIE Sync password has been updated.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 28px;">
                <table class="soft-panel" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e5eaf3;border-radius:12px;">
                  <tr>
                    <td style="padding:12px 14px;">
                      <p class="body-text" style="margin:0;font-size:13px;line-height:1.65;color:#374151;">If this was not you, reset your password immediately and review active sessions in your account settings.</p>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-top:1px solid #e5eaf3;">
                  <tr>
                    <td style="padding-top:12px;">
                      <p class="muted" style="margin:0;font-size:11px;line-height:1.7;color:#7b8494;">Need help? See our <a href="https://niesync.vercel.app/faq" style="color:#2563EB;text-decoration:none;">FAQ</a>.</p>
                      <p class="muted" style="margin:6px 0 0;font-size:11px;line-height:1.7;color:#7b8494;">Copyright 2026 NIE Sync. All rights reserved.</p>
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
```

## 4) Subject: NIE Sync | Google Account Linked

```html
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
                      <img src="https://niesync.vercel.app/logo.png" width="56" height="56" alt="NIE Sync" style="display:block;width:56px;height:56px;border-radius:12px;border:0;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <p style="margin:0;font-size:11px;line-height:1.4;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#FFB000;">NIE Sync</p>
                      <p style="margin:6px 0 0;font-size:17px;line-height:1.35;font-weight:800;color:#ffffff;">Google Provider Linked</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 12px;">
                <h1 class="title" style="margin:0;font-size:24px;line-height:1.3;font-weight:800;color:#111827;">Google account linked</h1>
                <p class="body-text" style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#1f2937;">A Google account was linked to your NIE Sync profile for sign-in.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 28px;">
                <table class="soft-panel" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e5eaf3;border-radius:12px;">
                  <tr>
                    <td style="padding:12px 14px;">
                      <p class="body-text" style="margin:0;font-size:13px;line-height:1.65;color:#374151;">If this was not you, open your account security settings and remove unknown providers immediately.</p>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-top:1px solid #e5eaf3;">
                  <tr>
                    <td style="padding-top:12px;">
                      <p class="muted" style="margin:0;font-size:11px;line-height:1.7;color:#7b8494;">Need help? See our <a href="https://niesync.vercel.app/faq" style="color:#2563EB;text-decoration:none;">FAQ</a>.</p>
                      <p class="muted" style="margin:6px 0 0;font-size:11px;line-height:1.7;color:#7b8494;">Copyright 2026 NIE Sync. All rights reserved.</p>
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
```
