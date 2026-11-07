import { getRestaurantForSlug, isServerOrAbove } from "@/lib/data/restaurant";
import { getOrderableMenu, getSessionDetail } from "@/lib/data/orders";
import { getBillingSettings } from "@/lib/data/billing";
import { OrderEntryWorkspace } from "@/components/orders/order-entry-workspace";
import { OpenCheckButton } from "@/components/billing/open-check-button";

export default async function OrderEntryPage({
  params,
}: {
  params: Promise<{ restaurantSlug: string; sessionId: string }>;
}) {
  const { restaurantSlug, sessionId } = await params;
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  const [session, categories, billing] = await Promise.all([
    getSessionDetail(sessionId),
    getOrderableMenu(restaurant.id),
    getBillingSettings(restaurant.id),
  ]);

  const hasFiredItems = session.orders.some((order) =>
    order.items.some((item) => item.status !== "cancelled" && item.status !== "pending"),
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] md:h-dvh">
      <header className="h-16 border-b border-outline-variant flex items-center gap-3 px-4 md:px-6 shrink-0">
        <h1 className="font-headline-sm text-headline-sm text-on-surface truncate">
          Table {session.table.label} &middot; Party of {session.partySize}
        </h1>
        {session.status === "active" && hasFiredItems && isServerOrAbove(staffMember.role) ? (
          <div className="ml-auto shrink-0">
            <OpenCheckButton restaurantSlug={restaurantSlug} sessionId={session.id} variant="outline" />
          </div>
        ) : null}
      </header>

      <OrderEntryWorkspace
        restaurantId={restaurant.id}
        restaurantSlug={restaurantSlug}
        staffMemberId={staffMember.id}
        session={session}
        categories={categories}
        taxRateBps={billing.taxRateBps}
      />
    </div>
  );
}
