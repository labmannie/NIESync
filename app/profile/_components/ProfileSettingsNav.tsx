"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Car, FileWarning, Heart, History, Menu, ShieldCheck, User, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  isActive: (pathname: string) => boolean;
};

const navItems: NavItem[] = [
  {
    href: "/profile",
    label: "Overview",
    icon: <User className="h-4 w-4" />,
    isActive: (pathname) => pathname === "/profile",
  },
  {
    href: "/profile/security",
    label: "Security",
    icon: <ShieldCheck className="h-4 w-4" />,
    isActive: (pathname) => pathname === "/profile/security",
  },
  {
    href: "/profile/vehicles",
    label: "Vehicles",
    icon: <Car className="h-4 w-4" />,
    isActive: (pathname) => pathname.startsWith("/profile/vehicles"),
  },
  {
    href: "/profile/reports",
    label: "Parking Issues",
    icon: <FileWarning className="h-4 w-4" />,
    isActive: (pathname) => pathname.startsWith("/profile/reports"),
  },
  {
    href: "/profile/sessions",
    label: "Auth History",
    icon: <History className="h-4 w-4" />,
    isActive: (pathname) => pathname.startsWith("/profile/sessions"),
  },
  {
    href: "/profile/likes",
    label: "Liked Posts",
    icon: <Heart className="h-4 w-4" />,
    isActive: (pathname) => pathname.startsWith("/profile/likes"),
  },
];

export function ProfileSettingsNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopExpanded, setDesktopExpanded] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const activeItem = useMemo(
    () => navItems.find((item) => item.isActive(pathname))?.label || "Profile",
    [pathname]
  );

  return (
    <>
      <aside className="sticky top-28 z-20 hidden h-fit self-start lg:block">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className={`relative overflow-visible rounded-2xl border border-white/10 bg-black/65 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-[width] duration-300 ${
            desktopExpanded ? "w-[260px]" : "w-[82px]"
          }`}
        >
          <div className={`mb-2 flex items-center ${desktopExpanded ? "justify-between" : "justify-center"}`}>
            <button
              type="button"
              onClick={() => setDesktopExpanded((value) => !value)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/90 transition-all duration-200 hover:border-white/25 hover:bg-white/[0.1]"
              aria-label={desktopExpanded ? "Collapse settings" : "Expand settings"}
            >
              {desktopExpanded ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>

            <AnimatePresence>
              {desktopExpanded ? (
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  className="pr-2 text-[10px] font-black uppercase tracking-[0.16em] text-text-secondary"
                >
                  Settings
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="space-y-2">
            {navItems.map((item) => {
              const active = item.isActive(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex overflow-visible rounded-xl border transition-all duration-200 ${
                    active
                      ? "border-accent-blue/40 bg-accent-blue/20 text-white"
                      : "border-white/10 bg-white/[0.03] text-text-secondary hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
                  } ${desktopExpanded ? "w-full items-center" : "mx-auto h-11 w-11 items-center justify-center"}`}
                  title={item.label}
                >
                  <span
                    className={`absolute inset-y-2 left-0 w-[2px] rounded-r-full transition-all duration-200 ${
                      active ? "bg-accent-blue/80" : "bg-transparent group-hover:bg-white/45"
                    }`}
                  />
                  {active ? (
                    <motion.span
                      layoutId="profile-nav-pill"
                      className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-accent-blue/20 to-cyan-400/10"
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    />
                  ) : null}

                  <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-110 group-hover:rotate-3">
                    {item.icon}
                  </span>

                  <AnimatePresence>
                    {desktopExpanded ? (
                      <motion.span
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        className="relative z-10 pr-3 text-xs font-bold uppercase tracking-[0.12em]"
                      >
                        {item.label}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>

                  {!desktopExpanded ? (
                    <span className="pointer-events-none absolute left-[3.5rem] z-30 whitespace-nowrap rounded-md border border-white/15 bg-[#121212] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white opacity-0 shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-opacity duration-150 group-hover:opacity-100">
                      {item.label}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>

          <Link
            href="/parking-patrol"
            className={`mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/85 transition-colors hover:bg-white/[0.09] ${
              desktopExpanded ? "w-full px-3" : "h-11 w-11 p-0"
            }`}
            title="Open Live Patrol"
          >
            {desktopExpanded ? "Open Live Patrol" : null}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </motion.div>
      </aside>

      <div className="fixed bottom-4 right-4 z-[80] lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-colors hover:bg-black/80"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          {mobileOpen ? "Close" : activeItem}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[75] bg-black/55 p-4 pt-24 backdrop-blur-sm lg:hidden"
          >
            <motion.div
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0d0d] p-4 shadow-[0_22px_80px_rgba(0,0,0,0.55)]"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">
                Settings
              </p>

              <div className="mt-3 space-y-2">
                {navItems.map((item) => {
                  const active = item.isActive(pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${
                        active
                          ? "border-accent-blue/35 bg-accent-blue/20 text-white"
                          : "border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.08]"
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

