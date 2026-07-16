import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log In | NIE Campus Sync",
  description: "Log in to your NIE Campus Sync account to report parking violations, browse lost and found, and join the forum.",

  openGraph: {
    title: "Log In | NIE Campus Sync",
    description: "Log in to your NIE Campus Sync account to report parking violations, browse lost and found, and join the forum.",
    url: "/login",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Log In | NIE Campus Sync",
    description: "Log in to your NIE Campus Sync account to report parking violations, browse lost and found, and join the forum.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
