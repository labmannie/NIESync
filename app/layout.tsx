import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

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
        {children}
      </body>
    </html>
  );
}
