import { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AuthFieldProps = {
  label?: string;
  htmlFor?: string;
  helper?: ReactNode;
  error?: ReactNode;
  labelTrailing?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AuthField({
  label,
  htmlFor,
  helper,
  error,
  labelTrailing,
  children,
  className,
}: AuthFieldProps) {
  return (
    <div className={cn("grid gap-2.5", className)}>
      {label ? (
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={htmlFor} className="auth-label">
            {label}
          </label>
          {labelTrailing}
        </div>
      ) : null}
      {children}
      {error ? <p className="auth-error-text">{error}</p> : null}
      {!error && helper ? <p className="auth-help">{helper}</p> : null}
    </div>
  );
}
