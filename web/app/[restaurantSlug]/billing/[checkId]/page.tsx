import Link from "next/link";

import { getRestaurantForSlug, isServerOrAbove } from "@/lib/data/restaurant";
import { getBillingSettings, getCheckDetail } from "@/lib/data/billing";
import { CheckWorkspace } from "@/components/billing/check-workspace";
import { Icon } from "@/components/icon";

export default async function CheckPage({
  params,
}: {
  params: Promise<{ restaurantSlug: string; checkId: string }>;
}) {
  const { restaurantSlug, checkId } = await params;
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  const [check, settings] = await Promise.all([
    getCheckDetail(checkId),
    getBillingSettings(restaurant.id),
  ]);

  return (
    <div className="flex flex-col min-h-[calc(100dvh-3.5rem)] md:min-h-dvh lg:h-dvh">
      <header className="h-16 border-b border-outline-variant flex items-center gap-2 px-2 md:px-4 shrink-0">
        <Link
          href={`/${restaurantSlug}/billing`}
          className="h-11 w-11 flex items-center justify-center rounded hover:bg-surface-container-high text-on-surface-variant"
          aria-label="Back to billing"
        >
          <Icon name="arrow_back" />
        </Link>
        <h1 className="font-headline-sm text-headline-sm text-on-surface truncate">
          Table {check.session.tableLabel} &middot; Check
        </h1>
        <span className="ml-auto font-label-caps text-label-caps text-on-surface-variant uppercase pr-2">
          {check.status}
        </span>
      </header>

      <CheckWorkspace
        restaurantId={restaurant.id}
        restaurantSlug={restaurantSlug}
        check={check}
        canBill={isServerOrAbove(staffMember.role)}
        paymentsReady={settings.stripeAccount?.chargesEnabled ?? false}
      />
    </div>
  );
}
