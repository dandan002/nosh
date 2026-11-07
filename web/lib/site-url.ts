import "server-only";

import { headers } from "next/headers";

// Absolute base URL for links handed to third parties (Stripe onboarding
// return/refresh URLs). Prefers an explicit NEXT_PUBLIC_SITE_URL, else
// derives it from the incoming request (works on Vercel previews and
// localhost without extra config).
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
