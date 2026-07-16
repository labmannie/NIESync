import type { ErrorEvent, EventHint } from "@sentry/nextjs";

// Best-effort redaction of PII that shouldn't leave the app in error reports:
// emails, NIE USNs (e.g. 4NI21CS001), and vehicle plates (Indian format, e.g.
// KA51AB1234). This runs on every event's message/exception text, breadcrumbs,
// and request data before it's sent to Sentry.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const USN_RE = /\b\d[A-Za-z]{2}\d{2}[A-Za-z]{2}\d{3}\b/g;
const PLATE_RE = /\b[A-Za-z]{2}[\s-]?\d{1,2}[\s-]?[A-Za-z]{0,3}[\s-]?\d{1,4}\b/g;

function redactString(value: string): string {
  return value
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(USN_RE, "[redacted-usn]")
    .replace(PLATE_RE, "[redacted-plate]");
}

function redactDeep<T>(value: T, depth = 0): T {
  if (depth > 6 || value == null) return value;
  if (typeof value === "string") return redactString(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth + 1)) as unknown as T;
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = redactDeep(val, depth + 1);
    }
    return result as unknown as T;
  }
  return value;
}

export function redactPiiFromEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent {
  if (event.request) {
    if (event.request.cookies) delete event.request.cookies;
    if (event.request.headers) {
      const headers = { ...event.request.headers };
      delete headers["cookie"];
      delete headers["Cookie"];
      delete headers["authorization"];
      delete headers["Authorization"];
      event.request.headers = headers;
    }
    if (event.request.data) event.request.data = redactDeep(event.request.data);
  }

  if (event.user) {
    delete event.user.email;
    delete (event.user as Record<string, unknown>).username;
  }

  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((exception) => ({
      ...exception,
      value: exception.value ? redactString(exception.value) : exception.value,
    }));
  }

  if (event.message) {
    event.message = redactString(event.message);
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      message: crumb.message ? redactString(crumb.message) : crumb.message,
      data: crumb.data ? redactDeep(crumb.data) : crumb.data,
    }));
  }

  return event;
}
