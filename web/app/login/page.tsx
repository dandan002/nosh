"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { login } from "@/lib/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <AuthShell title="Welcome Back" subtitle="Log in to your Kitchen Hub.">
      <form action={action} className="space-y-6">
        <div className="space-y-2 group">
          <Label htmlFor="email">Work Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            icon="mail"
            placeholder="jane@restaurant.com"
            required
          />
          {state?.fieldErrors?.email ? (
            <p className="font-label-caps text-label-caps text-error pl-1">
              {state.fieldErrors.email[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 group">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              icon="lock"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant p-2"
              onClick={() => setShowPassword((v) => !v)}
            >
              <Icon name={showPassword ? "visibility_off" : "visibility"} className="text-[20px]" />
            </button>
          </div>
        </div>

        {state?.error ? (
          <p className="font-body-md text-body-md text-error">{state.error}</p>
        ) : null}

        <div className="pt-6 space-y-4">
          <Button
            type="submit"
            variant="secondary"
            disabled={pending}
            className="w-full h-auto py-4 rounded-lg"
          >
            {pending ? "Logging in..." : "Log In"}
            <Icon name="arrow_forward" className="text-[20px]" />
          </Button>
          <div className="text-center">
            <p className="font-body-md text-body-md text-on-surface-variant">
              New to rev?{" "}
              <Link
                href="/signup"
                className="text-primary hover:text-primary-container font-medium underline underline-offset-4"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </form>
    </AuthShell>
  );
}
