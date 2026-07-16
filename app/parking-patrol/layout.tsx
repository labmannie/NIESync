import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Parking Patrol | NIE Campus Sync",
  description: "Report and track parking violations across NIE campus in real time.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Parking Patrol | NIE Campus Sync",
    description: "Report and track parking violations across NIE campus in real time.",
    url: "/parking-patrol",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Parking Patrol | NIE Campus Sync",
    description: "Report and track parking violations across NIE campus in real time.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
