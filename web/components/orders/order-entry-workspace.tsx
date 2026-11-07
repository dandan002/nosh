"use client";

import { useState, useTransition } from "react";

import type { OrderableCategory, OrderableItem, SessionDetail } from "@/lib/data/orders";
import { fireOrder } from "@/lib/actions/orders";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { ModifierPicker } from "@/components/orders/modifier-picker";
import { Ticket, type DraftLine } from "@/components/orders/ticket";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

let draftKeyCounter = 0;
function nextDraftKey(): string {
  draftKeyCounter += 1;
  return `draft-${draftKeyCounter}`;
}

export function OrderEntryWorkspace({
  restaurantId,
  restaurantSlug,
  staffMemberId,
  session,
  categories,
  taxRateBps,
}: {
  taxRateBps: number;
  restaurantId: string;
  restaurantSlug: string;
  staffMemberId: string;
  session: SessionDetail;
  categories: OrderableCategory[];
}) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(categories[0]?.id);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [pickerItem, setPickerItem] = useState<OrderableItem | null>(null);
  const [firing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Below lg the menu and ticket can't sit side by side, so one is shown at a
  // time behind a Menu/Ticket toggle. Ignored at lg+.
  const [mobileView, setMobileView] = useState<"menu" | "ticket">("menu");

  // Filtered by restaurant, not by this session's order_items specifically
  // — postgres_changes only supports a single equality filter, and
  // order_items doesn't carry a session id directly (it hangs off orders).
  // Same tradeoff the kitchen board makes; this is what lets a server see a
  // ticket move to "Preparing"/"Ready" live as the kitchen works it.
  useRealtimeRefresh(`order-entry-${restaurantId}`, restaurantId, ["order_items"]);

  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? categories[0];

  function handleItemClick(item: OrderableItem) {
    if (item.modifierGroups.length > 0) {
      setPickerItem(item);
      return;
    }
    setDraftLines((prev) => [
      ...prev,
      {
        key: nextDraftKey(),
        menuItemId: item.id,
        name: item.name,
        unitPriceCents: item.priceCents,
        quantity: 1,
        notes: "",
        modifiers: [],
      },
    ]);
  }

  function handleModifierAdd(
    item: OrderableItem,
    selection: { quantity: number; notes: string; modifiers: DraftLine["modifiers"] },
  ) {
    setDraftLines((prev) => [
      ...prev,
      {
        key: nextDraftKey(),
        menuItemId: item.id,
        name: item.name,
        unitPriceCents: item.priceCents,
        quantity: selection.quantity,
        notes: selection.notes,
        modifiers: selection.modifiers,
      },
    ]);
    setPickerItem(null);
  }

  function incrementLine(key: string) {
    setDraftLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line)),
    );
  }

  function decrementLine(key: string) {
    setDraftLines((prev) =>
      prev
        .map((line) => (line.key === key ? { ...line, quantity: line.quantity - 1 } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  function removeLine(key: string) {
    setDraftLines((prev) => prev.filter((line) => line.key !== key));
  }

  function handleFire() {
    setError(null);
    startTransition(async () => {
      const result = await fireOrder(
        restaurantId,
        session.id,
        restaurantSlug,
        staffMemberId,
        draftLines.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          notes: line.notes || undefined,
          modifierIds: line.modifiers.map((m) => m.modifierId),
        })),
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      setDraftLines([]);
    });
  }

  const draftCount = draftLines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
      <div
        role="tablist"
        aria-label="Order entry view"
        className="lg:hidden grid grid-cols-2 gap-1 p-1 border-b border-outline-variant bg-surface-container-low shrink-0"
      >
        {(["menu", "ticket"] as const).map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={mobileView === view}
            onClick={() => setMobileView(view)}
            className={cn(
              "h-11 rounded flex items-center justify-center gap-2 font-label-lg text-label-lg transition-colors",
              mobileView === view
                ? "bg-secondary-container text-on-secondary-container font-bold"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
            )}
          >
            <Icon name={view === "menu" ? "restaurant_menu" : "receipt_long"} className="text-xl" />
            {view === "menu" ? "Menu" : "Ticket"}
            {view === "ticket" && draftCount > 0 ? (
              <span className="min-w-6 h-6 px-1.5 rounded-full bg-primary text-on-primary font-label-caps text-label-caps flex items-center justify-center">
                {draftCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden",
          mobileView === "ticket" && "max-lg:hidden",
        )}
      >
        {categories.length === 0 ? (
          <p className="p-6 font-body-md text-body-md text-on-surface-variant">
            No available menu items — add some from Menu.
          </p>
        ) : (
          <>
            <div className="h-14 lg:h-12 border-b border-outline-variant bg-surface flex items-center gap-1 px-4 lg:px-6 shrink-0 overflow-x-auto">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategoryId(category.id)}
                  className={cn(
                    "px-4 lg:px-3 py-2.5 lg:py-1.5 rounded font-label-caps text-label-caps whitespace-nowrap transition-colors",
                    category.id === activeCategory?.id
                      ? "bg-secondary-container text-on-secondary-container font-bold"
                      : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
                  )}
                >
                  {category.name}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-auto p-4 lg:p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {activeCategory?.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className="text-left border border-outline-variant rounded p-3 min-h-20 bg-surface hover:bg-surface-container-high active:bg-surface-container-highest transition-colors flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-body-lg text-body-lg text-on-surface">
                        {item.name}
                      </span>
                      <Icon name="add_circle" className="text-primary text-xl shrink-0" />
                    </div>
                    <span className="font-label-lg text-label-lg text-on-surface-variant">
                      {money(item.priceCents)}
                    </span>
                    {item.description ? (
                      <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                        {item.description}
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <Ticket
        className={cn(mobileView === "menu" && "max-lg:hidden")}
        draftLines={draftLines}
        firedOrders={session.orders}
        restaurantSlug={restaurantSlug}
        sessionPath={`/${restaurantSlug}/orders/${session.id}`}
        taxRateBps={taxRateBps}
        onIncrement={incrementLine}
        onDecrement={decrementLine}
        onRemove={removeLine}
        onFire={handleFire}
        firing={firing}
        error={error}
      />

      {pickerItem ? (
        <ModifierPicker
          item={pickerItem}
          onAdd={(selection) => handleModifierAdd(pickerItem, selection)}
          onClose={() => setPickerItem(null)}
        />
      ) : null}
    </div>
  );
}
