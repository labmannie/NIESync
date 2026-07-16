import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | NIE Campus Sync",
  description: "The terms that govern your use of NIE Campus Sync.",

  openGraph: {
    title: "Terms of Service | NIE Campus Sync",
    description: "The terms that govern your use of NIE Campus Sync.",
    url: "/terms-of-service",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Terms of Service | NIE Campus Sync",
    description: "The terms that govern your use of NIE Campus Sync.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
