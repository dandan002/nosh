"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";

import type { OrderableFloorSection } from "@/lib/data/orders";
import { markTableClean, seatTable } from "@/lib/actions/orders";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { STATUS_LABEL, STATUS_SWATCH } from "@/lib/floor-plan-styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

function SeatTableForm({
  restaurantId,
  tableId,
  restaurantSlug,
  staffMemberId,
  onCancel,
}: {
  restaurantId: string;
  tableId: string;
  restaurantSlug: string;
  staffMemberId: string;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    seatTable.bind(null, restaurantId, tableId, restaurantSlug, staffMemberId),
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2 p-3 bg-surface-container-low rounded">
      <label className="font-label-caps text-label-caps text-on-surface-variant">
        Party size
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="partySize"
          type="number"
          min={1}
          max={30}
          defaultValue={2}
          required
          autoFocus
          className="h-11 text-sm w-20"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Seating..." : "Seat"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {state?.fieldErrors?.partySize ? (
        <p className="font-label-caps text-label-caps text-error">
          {state.fieldErrors.partySize[0]}
        </p>
      ) : null}
      {state?.error ? (
        <p className="font-label-caps text-label-caps text-error">{state.error}</p>
      ) : null}
    </form>
  );
}

function MarkCleanButton({ tableId, restaurantSlug }: { tableId: string; restaurantSlug: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await markTableClean(tableId, restaurantSlug);
            if (result?.error) setError(result.error);
          });
        }}
      >
        <Icon name="cleaning_services" className="text-base" /> {pending ? "Saving..." : "Mark clean"}
      </Button>
      {error ? <p className="font-label-caps text-label-caps text-error">{error}</p> : null}
    </>
  );
}

export function TablePicker({
  restaurantId,
  restaurantSlug,
  sections,
  staffMemberId,
  canSeat,
}: {
  restaurantId: string;
  restaurantSlug: string;
  sections: OrderableFloorSection[];
  staffMemberId: string;
  canSeat: boolean;
}) {
  const [seatingTableId, setSeatingTableId] = useState<string | null>(null);

  useRealtimeRefresh(`orders-picker-${restaurantId}`, restaurantId, ["tables", "table_sessions"]);

  if (sections.length === 0) {
    return (
      <p className="p-6 text-on-surface-variant font-body-md text-body-md">
        No floor plan set up yet — add one from Seating.
      </p>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6 flex flex-col gap-8">
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-3">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">{section.name}</h2>
          {section.tables.length === 0 ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              No tables in this section.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {section.tables.map((table) => {
                const occupied = table.activeSessionId !== null;
                return (
                  <div
                    key={table.id}
                    className="border border-outline-variant rounded p-3 bg-surface flex flex-col gap-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <span className="font-headline-sm text-headline-sm text-on-surface">
                        {table.label}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <div className={cn("w-3 h-3", STATUS_SWATCH[table.status])} />
                        <span className="font-label-caps text-label-caps text-on-surface-variant">
                          {occupied ? "Occupied" : STATUS_LABEL[table.status]}
                        </span>
                      </div>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {table.seats} seats
                    </p>

                    {occupied ? (
                      <Button variant="outline" asChild>
                        <Link href={`/${restaurantSlug}/orders/${table.activeSessionId}`}>
                          <Icon name="receipt_long" className="text-base" /> View Order
                        </Link>
                      </Button>
                    ) : canSeat ? (
                      <>
                      {table.status === "dirty" && seatingTableId !== table.id ? (
                        <MarkCleanButton tableId={table.id} restaurantSlug={restaurantSlug} />
                      ) : null}
                      {seatingTableId === table.id ? (
                        <SeatTableForm
                          restaurantId={restaurantId}
                          tableId={table.id}
                          restaurantSlug={restaurantSlug}
                          staffMemberId={staffMemberId}
                          onCancel={() => setSeatingTableId(null)}
                        />
                      ) : (
                        <Button onClick={() => setSeatingTableId(table.id)}>
                          <Icon name="add" className="text-base" /> Seat
                        </Button>
                      )}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
