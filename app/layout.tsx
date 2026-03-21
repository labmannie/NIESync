import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { ParkingOwnerBanner } from "@/app/_components/ParkingOwnerBanner";

const rubik = Rubik({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NIE Campus Sync",
  description: "The unified portal for NIE students to report parking violations and track lost items in real-time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={rubik.className} suppressHydrationWarning>
        <Navbar />
        <ParkingOwnerBanner />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
