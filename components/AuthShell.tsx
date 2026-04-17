import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";

import { AuthProgress, AuthProgressStep } from "@/components/AuthProgress";
import { cn } from "@/lib/utils";

type AuthShellHighlight = {
  title: string;
  description: string;
};

type AuthShellStat = {
  label: string;
  value: string;
};

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  heroEyebrow?: string;
  heroTitle?: ReactNode;
  heroDescription?: string;
  heroHighlights?: AuthShellHighlight[];
  heroStats?: AuthShellStat[];
  progress?: {
    currentStep: number;
    totalSteps: number;
    label?: string;
    steps?: AuthProgressStep[];
  };
  size?: "compact" | "regular" | "wide";
  className?: string;
};

const shellSizes = {
  compact: "max-w-[920px]",
  regular: "max-w-[1040px]",
  wide: "max-w-[1160px]",
};

export function AuthShell({
  title,
  description,
  children,
  footer,
  heroEyebrow = "NIESync",
  heroTitle,
  heroDescription = "Use your NIE account to continue.",
  heroHighlights = [],
  heroStats = [],
  progress,
  size = "regular",
  className,
}: AuthShellProps) {
  return (
    <main className="auth-shell">
      <div className={cn("auth-shell-inner", shellSizes[size])}>
        <section className="auth-page-grid">
          <div className="auth-brand-panel">
            <div className="inline-flex items-center gap-3">
              <Link
                href="/"
                className="focus-ring inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.07] transition duration-200 hover:bg-white/[0.11]"
                aria-label="Go to home page"
              >
                <Image
                  src="/logo.png"
                  alt="NIESync"
                  width={28}
                  height={28}
                  className="h-7 w-7 object-contain"
                />
              </Link>
              <div className="min-w-0">
                <p className="auth-kicker">{heroEyebrow}</p>
              </div>
            </div>

            <div className="space-y-5">
              <h1 className="text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl lg:text-[3rem] lg:leading-[1.06]">
                {heroTitle || (
                  <>
                    Sign in to <span className="text-white">NIESync</span>
                  </>
                )}
              </h1>
              {heroDescription ? (
                <p className="max-w-lg text-sm leading-7 text-white/66 sm:text-base">{heroDescription}</p>
              ) : null}
            </div>

            {heroHighlights.length ? (
              <div className="grid gap-3">
                {heroHighlights.map((item) => (
                  <div key={item.title} className="auth-brand-highlight">
                    <span className="auth-brand-highlight-dot" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-white/58">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {heroStats.length ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {heroStats.map((item) => (
                  <div key={item.label} className="auth-stat-card">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/48">{item.label}</p>
                    <p className="mt-2 text-base font-black text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <section className={cn("auth-card", className)}>
            <div className="space-y-4 border-b border-white/8 pb-5">
              <div className="space-y-2">
                <p className="auth-kicker">NIESync account</p>
                <h2 className="text-2xl font-black tracking-tight text-white sm:text-[1.85rem]">{title}</h2>
                <p className="max-w-2xl text-sm leading-6 text-white/64">
                  {description}
                </p>
              </div>
              {progress ? <AuthProgress {...progress} /> : null}
            </div>

            <div className="pt-6">{children}</div>
          </section>
        </section>

        {footer ? (
          <div className="mx-auto mt-6 max-w-3xl text-center text-sm leading-6 text-white/58">
            {footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}
