"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Github, Instagram, Linkedin, Twitter } from "lucide-react";
import Image from "next/image";
import { shouldHideGlobalChrome } from "@/lib/authRoutes";

const PRODUCT_LINKS = [
  { name: "Lost & Found", href: "/lost-and-found" },
  { name: "Parking Patrol", href: "/parking-patrol" },
  { name: "Leaderboard", href: "/leaderboard" },
];

const RESOURCE_LINKS = [
  { name: "FAQ", href: "/faq" },
  { name: "Contact", href: "/contact" },
  { name: "About", href: "/about" },
  { name: "Status", href: "/status" },
];

const COMPANY_LINKS = [
  { name: "Founders", href: "/founders" },
  { name: "Terms", href: "/terms-of-service" },
  { name: "Privacy", href: "/privacy-policy" },
];

const SOCIAL_LINKS = [
  { label: "X", href: "https://x.com", icon: Twitter },
  { label: "Instagram", href: "https://www.instagram.com", icon: Instagram },
  { label: "LinkedIn", href: "https://www.linkedin.com", icon: Linkedin },
  { label: "GitHub", href: "https://github.com", icon: Github },
];

function FooterLinkColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ name: string; href: string }>;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold tracking-wide text-white">{title}</h3>
      <ul className="space-y-2">
        {links.map((item) => (
          <li key={item.name}>
            <Link
              href={item.href}
              className="text-sm text-text-secondary hover:text-white transition-colors"
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  const pathname = usePathname();

  if (!pathname) return null;
  if (shouldHideGlobalChrome(pathname)) {
    return null;
  }

  const year = new Date().getFullYear();

  return (
    <footer className="relative w-full border-t border-white/10 bg-campus-black px-4 pb-8 pt-16 md:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_55%)]" />

      <div className="relative mx-auto w-full max-w-6xl rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:p-10">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-3">
              <div className="relative h-9 w-9 overflow-hidden rounded-xl border border-white/15 bg-white/[0.06]">
                <Image
                  src="/logo.png"
                  alt="NIE Sync"
                  fill
                  sizes="36px"
                  className="object-contain p-1.5"
                  priority={false}
                />
              </div>
              <span className="text-lg font-bold tracking-tight text-white">
                NIE Sync
              </span>
            </div>

            <p className="max-w-sm text-sm leading-relaxed text-text-secondary">
              NIE Sync helps campus teams and students coordinate lost-item
              recovery, parking compliance, and secure account access in one
              reliable portal.
            </p>

            <div className="flex items-center gap-3">
              {SOCIAL_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={item.label}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-text-secondary transition-colors hover:border-white/40 hover:text-white"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>
          </div>

          <FooterLinkColumn title="Product" links={PRODUCT_LINKS} />
          <FooterLinkColumn title="Resources" links={RESOURCE_LINKS} />
          <FooterLinkColumn title="Company" links={COMPANY_LINKS} />
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-white/10 pt-6 text-sm text-text-secondary md:flex-row md:items-center md:justify-between">
          <p>&copy; {year} NIE Sync. All rights reserved.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/privacy-policy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms-of-service" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
            <Link href="/status" className="hover:text-white transition-colors text-accent-blue font-semibold">
              System Status
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
