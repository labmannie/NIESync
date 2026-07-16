import type { Metadata } from "next";
import { ProfileSettingsNav } from "@/app/profile/_components/ProfileSettingsNav";

export const metadata: Metadata = {
  title: "Profile | NIE Campus Sync",
  description: "Manage your NIE Campus Sync profile and activity.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Profile | NIE Campus Sync",
    description: "Manage your NIE Campus Sync profile and activity.",
    url: "/profile",
    siteName: "NIE Campus Sync",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NIE Campus Sync" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Profile | NIE Campus Sync",
    description: "Manage your NIE Campus Sync profile and activity.",
    images: ["/logo.png"],
  },
};

export default function ProfileLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.16),transparent_38%),radial-gradient(circle_at_80%_18%,rgba(255,176,0,0.14),transparent_42%),#050505]">
      <div className="mx-auto w-full max-w-[1600px] px-3 md:px-5 lg:px-6">
        <div className="pb-10 lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start lg:gap-6 xl:gap-8">
          <ProfileSettingsNav />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
