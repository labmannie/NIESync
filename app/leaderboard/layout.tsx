import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard | NIE Campus Sync",
  description: "See the top student contributors recognized for reporting parking violations and returning lost items on the NIE campus.",

  openGraph: {
    title: "Leaderboard | NIE Campus Sync",
    description: "See the top student contributors recognized for reporting parking violations and returning lost items on the NIE campus.",
    url: "/leaderboard",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Leaderboard | NIE Campus Sync",
    description: "See the top student contributors recognized for reporting parking violations and returning lost items on the NIE campus.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
