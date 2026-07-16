"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { KitchenItemStatus, KitchenTicketItem } from "@/lib/data/kitchen";
import { advanceItemStatus } from "@/lib/actions/kitchen";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

type Column = {
  status: KitchenItemStatus;
  title: string;
  nextStatus: KitchenItemStatus | null;
  actionLabel: string | null;
};

const COLUMNS: Column[] = [
  { status: "fired", title: "New", nextStatus: "preparing", actionLabel: "Start" },
  { status: "preparing", title: "In Kitchen", nextStatus: "ready", actionLabel: "Mark Ready" },
  { status: "ready", title: "Ready", nextStatus: null, actionLabel: null },
];

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

function groupByOrder(items: KitchenTicketItem[]) {
  const byOrder = new Map<string, KitchenTicketItem[]>();
  for (const item of items) {
    const existing = byOrder.get(item.orderId);
    if (existing) {
      existing.push(item);
    } else {
      byOrder.set(item.orderId, [item]);
    }
  }
  return [...byOrder.values()];
}

function TicketItemRow({
  item,
  column,
  restaurantSlug,
  canAdvance,
}: {
  item: KitchenTicketItem;
  column: Column;
  restaurantSlug: string;
  canAdvance: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-start justify-between gap-2 py-2 border-b border-outline-variant last:border-b-0">
      <div className="min-w-0">
        <p className="font-body-md text-body-md text-on-surface">
          {item.quantity}&times; {item.menuItemName}
        </p>
        {item.modifiers.map((modifier) => (
          <p key={modifier} className="font-body-sm text-body-sm text-on-surface-variant pl-4">
            {modifier}
          </p>
        ))}
        {item.notes ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant pl-4 italic">
            {item.notes}
          </p>
        ) : null}
        {error ? <p className="font-label-caps text-label-caps text-error pl-4">{error}</p> : null}
      </div>

      {canAdvance && column.nextStatus && column.actionLabel ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await advanceItemStatus(
                item.id,
                restaurantSlug,
                column.status,
                column.nextStatus!,
              );
              if (result?.error) setError(result.error);
            });
          }}
        >
          {pending ? "..." : column.actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function KitchenBoard({
  restaurantId,
  restaurantSlug,
  items,
  canAdvance,
}: {
  restaurantId: string;
  restaurantSlug: string;
  items: KitchenTicketItem[];
  canAdvance: boolean;
}) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // Firing an order inserts several order_items rows at once, and this
    // component doesn't have the joined table/menu-item data a raw
    // postgres_changes payload carries — so any relevant change just asks
    // the server component to re-fetch via router.refresh(), debounced so a
    // multi-item fire doesn't trigger a burst of refreshes.
    function scheduleRefresh() {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 200);
    }

    // postgres_changes subscriptions are RLS-checked against the socket's
    // own auth token, which the realtime client doesn't always have set yet
    // by the time a channel is created from a fresh page load — subscribing
    // before that resolves silently connects as anon and never matches
    // "members can read order items," so no events ever arrive. Awaiting
    // the session and setting it explicitly avoids that race.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`kitchen-${restaurantId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "order_items",
            filter: `restaurant_id=eq.${restaurantId}`,
          },
          scheduleRefresh,
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (!channel) return;
      supabase.removeChannel(channel);
    };
  }, [restaurantId, router]);

  return (
    <div className="flex-1 overflow-auto p-6 flex gap-4">
      {COLUMNS.map((column) => {
        const columnItems = items.filter((item) => item.status === column.status);
        const tickets = groupByOrder(columnItems);

        return (
          <div
            key={column.status}
            className="w-80 shrink-0 flex flex-col gap-3 bg-surface-container-low rounded p-3"
          >
            <div className="flex items-center justify-between px-1">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">
                {column.title}
              </h2>
              <span className="font-label-caps text-label-caps text-on-surface-variant">
                {columnItems.length}
              </span>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto">
              {tickets.length === 0 ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant px-1">
                  Nothing here.
                </p>
              ) : (
                tickets.map((ticketItems) => {
                  const first = ticketItems[0];
                  return (
                    <div
                      key={first.orderId}
                      className={cn(
                        "bg-surface border border-outline-variant rounded p-3",
                        column.status === "fired" && "border-l-4 border-l-primary",
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-headline-sm text-headline-sm text-on-surface">
                          Table {first.tableLabel}
                        </span>
                        <div className="flex items-center gap-1 text-on-surface-variant">
                          <Icon name="schedule" className="text-sm" />
                          <span className="font-label-caps text-label-caps">
                            {timeAgo(first.firedAt)}
                          </span>
                        </div>
                      </div>
                      {first.serverName ? (
                        <p className="font-label-caps text-label-caps text-on-surface-variant mb-2">
                          Server: {first.serverName}
                        </p>
                      ) : null}
                      <div className="flex flex-col">
                        {ticketItems.map((item) => (
                          <TicketItemRow
                            key={item.id}
                            item={item}
                            column={column}
                            restaurantSlug={restaurantSlug}
                            canAdvance={canAdvance}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
