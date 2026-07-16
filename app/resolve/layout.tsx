import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Resolve Report | NIE Campus Sync",
  description: "Resolve a parking violation report.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Resolve Report | NIE Campus Sync",
    description: "Resolve a parking violation report.",
    url: "/resolve",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Resolve Report | NIE Campus Sync",
    description: "Resolve a parking violation report.",
    images: ["/logo.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
