import type { ReactNode } from "react";
import { authErrorMessage } from "@/lib/auth";
import { GoogleButton } from "./google-button";

/**
 * Shared body of /login and /signup: heading, error from the callback (if any), the Google
 * button and a footer line. Both pages run the same Google flow; only the copy differs.
 */
export function AuthPanel({
  title,
  description,
  next,
  error,
  footer,
  children,
}: {
  title: ReactNode;
  description: string;
  next: string;
  error?: string | null;
  footer: ReactNode;
  children?: ReactNode;
}) {
  const message = authErrorMessage(error);

  return (
    <div className="flex w-full max-w-sm flex-col gap-8">
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-h1">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>

      {message && (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {message}
        </p>
      )}

      <div className="flex flex-col gap-4">
        <GoogleButton next={next} />
        {children}
      </div>

      <p className="text-center text-sm text-muted-foreground">{footer}</p>
    </div>
  );
}
