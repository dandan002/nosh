import { getRestaurantForSlug, isManagerOrAbove } from "@/lib/data/restaurant";
import { getFloorPlan } from "@/lib/data/floor";
import { FloorWorkspace } from "@/components/floor/floor-workspace";

export default async function FloorPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { restaurantSlug } = await params;
  const { section: sectionParam } = await searchParams;
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  const sections = await getFloorPlan(restaurant.id);

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] md:h-dvh">
      <header className="h-16 border-b border-outline-variant flex items-center px-4 md:px-6 shrink-0">
        <h1 className="font-headline-sm text-headline-sm text-on-surface truncate">
          {restaurant.name} &middot; Seating
        </h1>
      </header>

      <FloorWorkspace
        restaurantId={restaurant.id}
        restaurantSlug={restaurantSlug}
        sections={sections}
        activeSectionId={sectionParam}
        canEdit={isManagerOrAbove(staffMember.role)}
      />
    </div>
  );
}
