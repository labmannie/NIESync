import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact | NIE Campus Sync",
  description: "Get in touch with the NIE Campus Sync team for support, feedback, or partnership inquiries.",

  openGraph: {
    title: "Contact | NIE Campus Sync",
    description: "Get in touch with the NIE Campus Sync team for support, feedback, or partnership inquiries.",
    url: "/contact",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Contact | NIE Campus Sync",
    description: "Get in touch with the NIE Campus Sync team for support, feedback, or partnership inquiries.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
