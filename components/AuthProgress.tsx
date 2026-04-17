import { cn } from "@/lib/utils";

export type AuthProgressStep = {
  label: string;
  detail?: string;
};

type AuthProgressProps = {
  currentStep: number;
  totalSteps: number;
  steps?: AuthProgressStep[];
  label?: string;
  className?: string;
};

export function AuthProgress({
  currentStep,
  totalSteps,
  steps = [],
  label,
  className,
}: AuthProgressProps) {
  const ratio = totalSteps > 0 ? Math.min(100, Math.max(0, (currentStep / totalSteps) * 100)) : 0;

  return (
    <div className={cn("auth-progress-shell", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="auth-progress-label">{label || "Progress"}</p>
          <p className="mt-1 text-sm font-semibold text-white/76">
            Step {currentStep} of {totalSteps}
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white/70">
          {ratio.toFixed(0)}%
        </div>
      </div>
      <div className="auth-progress-rail" aria-hidden="true">
        <span className="auth-progress-fill" style={{ width: `${ratio}%` }} />
      </div>
      {steps.length ? (
        <div className="hidden gap-2 sm:grid sm:grid-cols-3">
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            const state =
              stepNumber < currentStep ? "complete" : stepNumber === currentStep ? "current" : "upcoming";

            return (
              <div
                key={step.label}
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "auth-progress-step",
                  state === "complete" && "is-complete",
                  state === "current" && "is-current"
                )}
              >
                <span className="auth-progress-index">{stepNumber}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-white">{step.label}</span>
                  {step.detail ? (
                    <span className="mt-1 block text-xs leading-5 text-white/52">{step.detail}</span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
