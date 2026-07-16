import { getRestaurantForSlug } from "@/lib/data/restaurant";
import { getOrderableMenu, getSessionDetail } from "@/lib/data/orders";
import { OrderEntryWorkspace } from "@/components/orders/order-entry-workspace";

export default async function OrderEntryPage({
  params,
}: {
  params: Promise<{ restaurantSlug: string; sessionId: string }>;
}) {
  const { restaurantSlug, sessionId } = await params;
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  const [session, categories] = await Promise.all([
    getSessionDetail(sessionId),
    getOrderableMenu(restaurant.id),
  ]);

  return (
    <div className="flex flex-col h-screen">
      <header className="h-16 border-b border-outline-variant flex items-center px-6 shrink-0">
        <h1 className="font-headline-sm text-headline-sm text-on-surface">
          Table {session.table.label} &middot; Party of {session.partySize}
        </h1>
      </header>

      <OrderEntryWorkspace
        restaurantId={restaurant.id}
        restaurantSlug={restaurantSlug}
        staffMemberId={staffMember.id}
        session={session}
        categories={categories}
      />
    </div>
  );
}
