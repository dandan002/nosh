"use client";

import { useState, useTransition } from "react";

import { openCheckForSession } from "@/lib/actions/billing";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

// Opens the session's open check, generating one from its order_items if
// none exists yet. Used from the billing overview and the order-entry
// header.
export function OpenCheckButton({
  restaurantSlug,
  sessionId,
  label = "Check",
  variant = "primary",
}: {
  restaurantSlug: string;
  sessionId: string;
  label?: string;
  variant?: "primary" | "outline";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={variant}
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await openCheckForSession(restaurantSlug, sessionId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        <Icon name="receipt" className="text-lg" />
        {pending ? "Opening..." : label}
      </Button>
      {error ? (
        <p className="font-label-caps text-label-caps text-error text-right max-w-64">{error}</p>
      ) : null}
    </div>
  );
}
