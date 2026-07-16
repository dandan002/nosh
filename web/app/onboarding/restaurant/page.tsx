"use client";

import { useActionState } from "react";

import { createRestaurant } from "@/lib/actions/onboarding";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RestaurantOnboardingPage() {
  const [state, action, pending] = useActionState(createRestaurant, undefined);

  return (
    <AuthShell
      step={{ current: 2, total: 2 }}
      stepLabel="Restaurant Profile"
      title="Tell Us About Your Restaurant"
      subtitle="This becomes your Kitchen Hub's name and web address."
    >
      <form action={action} className="space-y-6">
        <div className="space-y-2 group">
          <Label htmlFor="name">Restaurant Name</Label>
          <Input
            id="name"
            name="name"
            icon="storefront"
            placeholder="The Cedar Room"
            required
          />
          {state?.fieldErrors?.name ? (
            <p className="font-label-caps text-label-caps text-error pl-1">
              {state.fieldErrors.name[0]}
            </p>
          ) : null}
        </div>

        {state?.error ? (
          <p className="font-body-md text-body-md text-error">{state.error}</p>
        ) : null}

        <div className="pt-6">
          <Button
            type="submit"
            variant="secondary"
            disabled={pending}
            className="w-full h-auto py-4 rounded-lg"
          >
            {pending ? "Setting up..." : "Enter Kitchen Hub"}
            <Icon name="arrow_forward" className="text-[20px]" />
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
