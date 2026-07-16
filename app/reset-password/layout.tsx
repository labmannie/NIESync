import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password | NIE Campus Sync",
  description: "Set a new password for your NIE Campus Sync account.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Reset Password | NIE Campus Sync",
    description: "Set a new password for your NIE Campus Sync account.",
    url: "/reset-password",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Reset Password | NIE Campus Sync",
    description: "Set a new password for your NIE Campus Sync account.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
