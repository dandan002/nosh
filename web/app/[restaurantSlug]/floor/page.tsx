import Link from "next/link";

import { getRestaurantForSlug } from "@/lib/data/restaurant";
import { getFloorPlan, type TableStatus } from "@/lib/data/floor";
import {
  SHAPE_MARKER,
  STATUS_LABEL,
  STATUS_MARKER,
  STATUS_ORDER,
  STATUS_SWATCH,
} from "@/lib/floor-plan-styles";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

export default async function FloorPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { restaurantSlug } = await params;
  const { section: sectionParam } = await searchParams;
  const { restaurant } = await getRestaurantForSlug(restaurantSlug);
  const sections = await getFloorPlan(restaurant.id);

  if (sections.length === 0) {
    return (
      <div className="flex flex-col h-screen">
        <FloorHeader restaurantName={restaurant.name} />
        <div className="flex-1 flex items-center justify-center text-on-surface-variant font-body-md text-body-md">
          No floor plan set up yet.
        </div>
      </div>
    );
  }

  const activeSection =
    sections.find((section) => section.id === sectionParam) ?? sections[0];

  const counts = STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = activeSection.tables.filter((table) => table.status === status).length;
      return acc;
    },
    {} as Record<TableStatus, number>,
  );

  return (
    <div className="flex flex-col h-screen">
      <FloorHeader restaurantName={restaurant.name} />

      <div className="h-14 border-b border-outline-variant bg-surface flex items-center justify-between px-6 shrink-0">
        {sections.length > 1 ? (
          <div className="flex items-center gap-1">
            {sections.map((section) => (
              <Link
                key={section.id}
                href={`?section=${section.id}`}
                className={cn(
                  "px-3 py-1.5 rounded font-label-caps text-label-caps transition-colors",
                  section.id === activeSection.id
                    ? "bg-secondary-container text-on-secondary-container font-bold"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
                )}
              >
                {section.name}
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Icon name="layers" className="text-on-surface-variant text-base" />
            <span className="font-body-md text-body-md font-semibold text-on-surface">
              {activeSection.name}
            </span>
          </div>
        )}

        <div className="flex items-center gap-4 font-label-caps text-label-caps text-on-surface-variant">
          {STATUS_ORDER.map((status) => (
            <div key={status} className="flex items-center gap-2">
              <div className={cn("w-4 h-4", STATUS_SWATCH[status])} />
              <span>
                {STATUS_LABEL[status]} ({counts[status]})
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 relative overflow-auto floorplan-bg">
        {activeSection.tables.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-on-surface-variant font-body-md text-body-md">
            No tables in this section yet.
          </div>
        ) : (
          <div className="relative min-w-[1000px] min-h-[800px] p-8">
            {activeSection.tables.map((table) => (
              <div
                key={table.id}
                className="absolute"
                style={{ left: table.posX, top: table.posY }}
              >
                <div
                  className={cn(
                    "flex flex-col items-center justify-center shadow-sm transition-all",
                    SHAPE_MARKER[table.shape],
                    STATUS_MARKER[table.status],
                  )}
                >
                  <span className="font-headline-md text-headline-md">{table.label}</span>
                  <span className="font-label-caps text-label-caps mt-1">
                    {table.status === "dirty" ? "Bus" : `${table.seats} Seats`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FloorHeader({ restaurantName }: { restaurantName: string }) {
  return (
    <header className="h-16 border-b border-outline-variant flex items-center px-6 shrink-0">
      <h1 className="font-headline-sm text-headline-sm text-on-surface">
        {restaurantName} &middot; Seating
      </h1>
    </header>
  );
}
