import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Status | NIE Campus Sync",
  description: "NIE Campus Sync system status.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Status | NIE Campus Sync",
    description: "NIE Campus Sync system status.",
    url: "/status",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Status | NIE Campus Sync",
    description: "NIE Campus Sync system status.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
