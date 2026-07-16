import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ | NIE Campus Sync",
  description: "Answers to common questions about parking reports, lost and found claims, and using NIE Campus Sync.",

  openGraph: {
    title: "FAQ | NIE Campus Sync",
    description: "Answers to common questions about parking reports, lost and found claims, and using NIE Campus Sync.",
    url: "/faq",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "FAQ | NIE Campus Sync",
    description: "Answers to common questions about parking reports, lost and found claims, and using NIE Campus Sync.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
