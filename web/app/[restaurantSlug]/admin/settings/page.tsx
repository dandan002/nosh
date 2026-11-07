import { getRestaurantForSlug } from "@/lib/data/restaurant";
import { getBillingSettings } from "@/lib/data/billing";
import { isStripeConfigured } from "@/lib/stripe/server";
import { StripeConnectPanel, TaxRateForm } from "@/components/billing/settings-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ stripe?: string }>;
}) {
  const { restaurantSlug } = await params;
  const { stripe } = await searchParams;
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  const settings = await getBillingSettings(restaurant.id);
  const canManage = staffMember.role === "owner" || staffMember.role === "admin";

  return (
    <div className="flex flex-col min-h-[calc(100dvh-3.5rem)] md:min-h-dvh">
      <header className="h-16 border-b border-outline-variant flex items-center px-4 md:px-6 shrink-0">
        <h1 className="font-headline-sm text-headline-sm text-on-surface truncate">
          {restaurant.name} &middot; Settings
        </h1>
      </header>

      <main className="p-4 md:p-6 flex flex-col gap-6 max-w-2xl w-full">
        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <StripeConnectPanel
              restaurantSlug={restaurantSlug}
              account={settings.stripeAccount}
              canManage={canManage}
              stripeConfigured={isStripeConfigured()}
              justReturned={stripe === "return"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <TaxRateForm
              restaurantSlug={restaurantSlug}
              taxRateBps={settings.taxRateBps}
              canEdit={canManage}
            />
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Applied to the subtotal when a check is generated. Checks already generated keep
              the rate they were created with.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
