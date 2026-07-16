import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | NIE Campus Sync",
  description: "How NIE Campus Sync collects, uses, and protects your data.",

  openGraph: {
    title: "Privacy Policy | NIE Campus Sync",
    description: "How NIE Campus Sync collects, uses, and protects your data.",
    url: "/privacy-policy",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy | NIE Campus Sync",
    description: "How NIE Campus Sync collects, uses, and protects your data.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
