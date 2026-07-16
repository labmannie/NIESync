import * as Sentry from "@sentry/nextjs";
import { redactPiiFromEvent } from "@/lib/sentryRedact";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.1,
  beforeSend: redactPiiFromEvent,
});
