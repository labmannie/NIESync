import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forum | NIE Campus Sync",
  description: "Connect with fellow NIE students on the campus forum.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Forum | NIE Campus Sync",
    description: "Connect with fellow NIE students on the campus forum.",
    url: "/forum",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Forum | NIE Campus Sync",
    description: "Connect with fellow NIE students on the campus forum.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
