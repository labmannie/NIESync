import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up | NIE Campus Sync",
  description: "Create your NIE Campus Sync account to get started.",

  openGraph: {
    title: "Sign Up | NIE Campus Sync",
    description: "Create your NIE Campus Sync account to get started.",
    url: "/signup",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Sign Up | NIE Campus Sync",
    description: "Create your NIE Campus Sync account to get started.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
