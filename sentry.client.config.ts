import * as Sentry from "@sentry/nextjs";
import { redactPiiFromEvent } from "@/lib/sentryRedact";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.1,
  // Session Replay is off by default — screen recordings of a campus app used by
  // real students are a much bigger PII surface than we want to opt into
  // silently. Enable deliberately later if it's actually wanted.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeSend: redactPiiFromEvent,
});
