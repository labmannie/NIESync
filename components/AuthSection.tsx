import { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AuthSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function AuthSection({
  title,
  description,
  children,
  className,
}: AuthSectionProps) {
  return (
    <section className={cn("auth-section-surface", className)}>
      <div className="space-y-1">
        <h2 className="text-lg font-black tracking-tight text-white sm:text-xl">{title}</h2>
        {description ? (
          <p className="text-sm leading-6 text-white/62">{description}</p>
        ) : null}
      </div>
      <div className="mt-5 grid gap-4">{children}</div>
    </section>
  );
}
