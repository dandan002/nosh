import { getRestaurantForSlug, isServerOrAbove } from "@/lib/data/restaurant";
import { getTablesForOrderEntry } from "@/lib/data/orders";
import { TablePicker } from "@/components/orders/table-picker";

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  const sections = await getTablesForOrderEntry(restaurant.id);

  return (
    <div className="flex flex-col h-screen">
      <header className="h-16 border-b border-outline-variant flex items-center px-6 shrink-0">
        <h1 className="font-headline-sm text-headline-sm text-on-surface">
          {restaurant.name} &middot; Orders
        </h1>
      </header>

      <TablePicker
        restaurantId={restaurant.id}
        restaurantSlug={restaurantSlug}
        sections={sections}
        staffMemberId={staffMember.id}
        canSeat={isServerOrAbove(staffMember.role)}
      />
    </div>
  );
}
