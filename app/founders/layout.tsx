import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Founders | NIE Campus Sync",
  description: "Meet the students behind NIE Campus Sync.",

  openGraph: {
    title: "Founders | NIE Campus Sync",
    description: "Meet the students behind NIE Campus Sync.",
    url: "/founders",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Founders | NIE Campus Sync",
    description: "Meet the students behind NIE Campus Sync.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
