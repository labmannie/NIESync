/** @type {import('next').NextConfig} */
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'mhaajysljuaosdseboid.supabase.co',
        port: '',
        // Covers every public storage bucket in this Supabase project (avatars,
        // lost-and-found, parking report photos, forum post images, etc), not
        // just /avatars/** — they all live under the same trusted project, so
        // this doesn't open the door to arbitrary hosts.
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // Suppress "[webpack.cache.PackFileCacheStrategy] Serializing big strings" warning
    config.infrastructureLogging = {
      ...config.infrastructureLogging,
      level: 'error',
    };
    return config;
  },
};

// withSentryConfig only uploads source maps (for readable stack traces in the
// Sentry dashboard) when SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT are set —
// it's a safe no-op locally and in forks that haven't configured Sentry.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
  reactComponentAnnotation: { enabled: true },
  telemetry: false,
});
