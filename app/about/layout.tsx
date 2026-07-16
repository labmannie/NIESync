import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | NIE Campus Sync",
  description: "Learn about NIE Campus Sync, the unified portal for NIE students to report parking violations, recover lost items, and connect on the campus forum.",

  openGraph: {
    title: "About | NIE Campus Sync",
    description: "Learn about NIE Campus Sync, the unified portal for NIE students to report parking violations, recover lost items, and connect on the campus forum.",
    url: "/about",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "About | NIE Campus Sync",
    description: "Learn about NIE Campus Sync, the unified portal for NIE students to report parking violations, recover lost items, and connect on the campus forum.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
