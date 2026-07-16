import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lost & Found | NIE Campus Sync",
  description: "Report and claim lost items across NIE campus.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Lost & Found | NIE Campus Sync",
    description: "Report and claim lost items across NIE campus.",
    url: "/lost-and-found",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Lost & Found | NIE Campus Sync",
    description: "Report and claim lost items across NIE campus.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
