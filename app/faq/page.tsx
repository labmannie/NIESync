"use client";

import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CarFront,
  ChevronDown,
  HelpCircle,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";

type FaqCategory = {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  items: Array<{ question: string; answer: string }>;
};

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "account",
    title: "Account and Access",
    description: "Sign-up, login methods, and verification basics.",
    icon: UserRound,
    items: [
      {
        question: "Can I use both password login and Google Sign-In?",
        answer:
          "Yes. If your profile has only one login method today, use Profile settings to link the other provider so both methods work for the same account.",
      },
      {
        question: "Why is phone number mandatory during signup and profile edit?",
        answer:
          "Phone number is required for identity reliability and retrieval coordination. Accounts cannot proceed with an empty or invalid phone number.",
      },
      {
        question: "Who is allowed to register?",
        answer:
          "NIE Sync is restricted to institutional users. Access is intended for valid NIE student and staff identities.",
      },
    ],
  },
  {
    id: "lost-found",
    title: "Lost and Found",
    description: "Item reporting, search, and return flow.",
    icon: Search,
    items: [
      {
        question: "How quickly are potential matches shown?",
        answer:
          "Reports appear in real time, and owners can act as soon as a matching item and verification details are available.",
      },
      {
        question: "Can I report without full item details?",
        answer:
          "You can submit with partial details, but richer information significantly improves match quality and retrieval speed.",
      },
      {
        question: "How is ownership verified before return?",
        answer:
          "NIE Sync uses profile identity signals and report context checks before marking an item handoff as verified.",
      },
    ],
  },
  {
    id: "parking",
    title: "Parking Patrol",
    description: "Vehicle records, plate format, and enforcement flow.",
    icon: CarFront,
    items: [
      {
        question: "What vehicle plate format is accepted?",
        answer:
          "Use the full structured format, for example: KA-09-AB-1234. Invalid or incomplete formats are rejected for consistency.",
      },
      {
        question: "Can I register more than one vehicle?",
        answer:
          "Yes. You can keep a primary vehicle and add additional vehicles in profile edit mode for better parking trace accuracy.",
      },
      {
        question: "What if my vehicle details change?",
        answer:
          "Update profile details anytime. Changes sync immediately and become available to parking and recovery workflows.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy and Security",
    description: "Data controls, sessions, and account protection.",
    icon: ShieldCheck,
    items: [
      {
        question: "Can I review and revoke active sessions?",
        answer:
          "Yes. Use the sessions screen from Profile to inspect active devices and revoke sessions you no longer trust.",
      },
      {
        question: "Can I download my data?",
        answer:
          "Yes. The profile page includes a data export action that prepares your account-related profile and session data.",
      },
      {
        question: "How do I permanently delete my account?",
        answer:
          "Profile includes a protected delete flow with confirmation checks and recent-login verification for safety.",
      },
    ],
  },
];

export default function FaqPage() {
  const firstQuestionId = `${FAQ_CATEGORIES[0].id}-0`;
  const [openItemId, setOpenItemId] = useState(firstQuestionId);

  const totalQuestions = useMemo(
    () => FAQ_CATEGORIES.reduce((sum, category) => sum + category.items.length, 0),
    []
  );

  return (
    <main className="min-h-screen w-full bg-campus-black px-4 pb-20 pt-32 text-white selection:bg-accent-blue/30 selection:text-white sm:px-8 md:pt-40">
      <div className="mx-auto w-full max-w-6xl">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-10 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:px-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(37,99,235,0.22),transparent_45%)]" />
          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-text-secondary">
                <HelpCircle className="h-4 w-4 text-accent-blue" />
                Support Knowledge Base
              </div>
              <h1 className="text-4xl font-black uppercase tracking-tight sm:text-5xl">
                Frequently Asked Questions
              </h1>
              <p className="text-base leading-relaxed text-text-secondary sm:text-lg">
                Fast answers to the most important NIE Sync workflows, including
                account setup, profile quality, parking operations, and data security.
              </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-3 text-center md:w-auto">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-2xl font-black">{FAQ_CATEGORIES.length}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-text-secondary">
                  Topics
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-2xl font-black">{totalQuestions}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-text-secondary">
                  Answers
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 space-y-6">
          {FAQ_CATEGORIES.map((category, categoryIndex) => {
            const CategoryIcon = category.icon;
            return (
              <motion.article
                key={category.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.45, delay: categoryIndex * 0.05 }}
                className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]"
              >
                <div className="border-b border-white/10 bg-black/30 px-6 py-5 sm:px-8">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.05]">
                      <CategoryIcon className="h-5 w-5 text-accent-blue" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black tracking-tight">{category.title}</h2>
                      <p className="mt-1 text-sm text-text-secondary">{category.description}</p>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-white/10">
                  {category.items.map((item, itemIndex) => {
                    const rowId = `${category.id}-${itemIndex}`;
                    const isOpen = openItemId === rowId;

                    return (
                      <div key={rowId}>
                        <button
                          type="button"
                          onClick={() => setOpenItemId(isOpen ? "" : rowId)}
                          className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-white/[0.03] sm:px-8"
                        >
                          <span className="text-sm font-semibold text-white sm:text-base">
                            {item.question}
                          </span>
                          <ChevronDown
                            className={`h-5 w-5 shrink-0 text-text-secondary transition-transform ${
                              isOpen ? "rotate-180 text-white" : ""
                            }`}
                          />
                        </button>

                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: "easeOut" }}
                              className="overflow-hidden"
                            >
                              <div className="border-t border-white/5 bg-black/20 px-6 py-4 text-sm leading-relaxed text-text-secondary sm:px-8 sm:text-[15px]">
                                {item.answer}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </motion.article>
            );
          })}
        </section>

        <section className="mt-10 rounded-3xl border border-white/10 bg-gradient-to-r from-white/[0.03] via-white/[0.01] to-white/[0.03] px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xl font-black tracking-tight">Need more help?</h3>
              <p className="mt-1 text-sm text-text-secondary sm:text-base">
                Reach the NIE Sync support team for issues specific to your account or report.
              </p>
            </div>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] transition-colors hover:bg-white/[0.12] sm:text-sm"
            >
              Contact Support
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
