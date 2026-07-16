"use client";

import type { FiredOrder } from "@/lib/data/orders";
import type { ModifierSelection } from "@/components/orders/modifier-picker";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

export type DraftLine = {
  key: string;
  menuItemId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  notes: string;
  modifiers: ModifierSelection[];
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function lineTotalCents(line: DraftLine): number {
  const modifiersTotal = line.modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0);
  return (line.unitPriceCents + modifiersTotal) * line.quantity;
}

// Placeholder rate for the running total shown while building a ticket —
// not the authoritative tax calculation, which belongs to Phase B billing
// (checks/payments) once that's built.
const DISPLAY_TAX_RATE = 0.08;

const ITEM_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  fired: "Fired",
  preparing: "Preparing",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function Ticket({
  draftLines,
  firedOrders,
  onIncrement,
  onDecrement,
  onRemove,
  onFire,
  firing,
  error,
}: {
  draftLines: DraftLine[];
  firedOrders: FiredOrder[];
  onIncrement: (key: string) => void;
  onDecrement: (key: string) => void;
  onRemove: (key: string) => void;
  onFire: () => void;
  firing: boolean;
  error: string | null;
}) {
  const draftSubtotal = draftLines.reduce((sum, line) => sum + lineTotalCents(line), 0);
  const draftTax = Math.round(draftSubtotal * DISPLAY_TAX_RATE);

  const firedSubtotal = firedOrders.reduce(
    (sum, order) =>
      sum +
      order.items.reduce(
        (itemSum, item) =>
          itemSum +
          (item.unitPriceCents + item.modifiers.reduce((s, m) => s + m.priceDeltaCents, 0)) *
            item.quantity,
        0,
      ),
    0,
  );

  return (
    <div className="w-96 bg-surface border-l border-outline-variant flex flex-col shrink-0">
      <div className="h-14 border-b border-outline-variant flex items-center px-4 shrink-0">
        <h2 className="font-headline-sm text-headline-sm text-on-surface">Current Order</h2>
      </div>

      <div className="flex-1 overflow-auto">
        {firedOrders.map((order) => (
          <div key={order.id} className="p-4 border-b border-outline-variant bg-surface-container-low">
            <p className="font-label-caps text-label-caps text-on-surface-variant mb-2">
              Fired {new Date(order.createdAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
            <div className="flex flex-col gap-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-body-md text-body-md text-on-surface">
                      {item.quantity}&times; {item.menuItemName}
                    </p>
                    {item.modifiers.map((modifier) => (
                      <p
                        key={modifier.id}
                        className="font-body-sm text-body-sm text-on-surface-variant pl-4"
                      >
                        {modifier.name}
                      </p>
                    ))}
                    {item.notes ? (
                      <p className="font-body-sm text-body-sm text-on-surface-variant pl-4 italic">
                        {item.notes}
                      </p>
                    ) : null}
                  </div>
                  <span className="font-label-caps text-label-caps text-on-surface-variant shrink-0">
                    {ITEM_STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {draftLines.length === 0 && firedOrders.length === 0 ? (
          <p className="p-4 font-body-md text-body-md text-on-surface-variant">
            No items yet — add something from the menu.
          </p>
        ) : null}

        {draftLines.length > 0 ? (
          <div className="flex flex-col divide-y divide-outline-variant">
            {draftLines.map((line) => (
              <div key={line.key} className="p-4 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-body-lg text-body-lg text-on-surface">{line.name}</p>
                  {line.modifiers.map((modifier) => (
                    <p
                      key={modifier.modifierId}
                      className="font-body-sm text-body-sm text-on-surface-variant"
                    >
                      {modifier.name}
                      {modifier.priceDeltaCents !== 0
                        ? ` (${modifier.priceDeltaCents > 0 ? "+" : ""}${(
                            modifier.priceDeltaCents / 100
                          ).toFixed(2)})`
                        : ""}
                    </p>
                  ))}
                  {line.notes ? (
                    <p className="font-body-sm text-body-sm text-on-surface-variant italic">
                      {line.notes}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-2 mt-2">
                    <Button variant="outline" size="icon" onClick={() => onDecrement(line.key)}>
                      <Icon name="remove" className="text-sm" />
                    </Button>
                    <span className="font-label-lg text-label-lg w-4 text-center">
                      {line.quantity}
                    </span>
                    <Button variant="outline" size="icon" onClick={() => onIncrement(line.key)}>
                      <Icon name="add" className="text-sm" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onRemove(line.key)}>
                      <Icon name="delete" className="text-sm text-error" />
                    </Button>
                  </div>
                </div>
                <span className="font-label-lg text-label-lg text-on-surface shrink-0">
                  {money(lineTotalCents(line))}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="p-4 border-t border-outline-variant shrink-0 flex flex-col gap-1">
        <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
          <span>Subtotal</span>
          <span>{money(firedSubtotal + draftSubtotal)}</span>
        </div>
        <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
          <span>Tax (8%, est.)</span>
          <span>{money(draftTax)}</span>
        </div>
        <div className="flex items-center justify-between font-headline-sm text-headline-sm text-on-surface mb-2">
          <span>Total</span>
          <span>{money(firedSubtotal + draftSubtotal + draftTax)}</span>
        </div>
        {error ? (
          <p className="font-label-caps text-label-caps text-error mb-1">{error}</p>
        ) : null}
        <Button
          className="w-full"
          disabled={draftLines.length === 0 || firing}
          onClick={onFire}
        >
          {firing ? "Firing..." : "Fire to Kitchen"}
        </Button>
      </div>
    </div>
  );
}
