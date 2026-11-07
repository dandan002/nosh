"use client";

import { useState } from "react";

import type { OrderableItem } from "@/lib/data/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

export type ModifierSelection = {
  modifierId: string;
  groupName: string;
  name: string;
  priceDeltaCents: number;
};

export function ModifierPicker({
  item,
  onAdd,
  onClose,
}: {
  item: OrderableItem;
  onAdd: (selection: { quantity: number; notes: string; modifiers: ModifierSelection[] }) => void;
  onClose: () => void;
}) {
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const unmetRequired = item.modifierGroups.some(
    (group) => group.required && (selectedByGroup[group.id]?.length ?? 0) === 0,
  );

  function toggle(groupId: string, modifierId: string, selectionType: "single" | "multiple") {
    setSelectedByGroup((prev) => {
      const current = prev[groupId] ?? [];
      if (selectionType === "single") {
        return { ...prev, [groupId]: current[0] === modifierId ? [] : [modifierId] };
      }
      const next = current.includes(modifierId)
        ? current.filter((id) => id !== modifierId)
        : [...current, modifierId];
      return { ...prev, [groupId]: next };
    });
  }

  function handleAdd() {
    const modifiers: ModifierSelection[] = item.modifierGroups.flatMap((group) =>
      (selectedByGroup[group.id] ?? [])
        .map((modifierId) => group.modifiers.find((m) => m.id === modifierId))
        .filter((m): m is OrderableItem["modifierGroups"][number]["modifiers"][number] => !!m)
        .map((modifier) => ({
          modifierId: modifier.id,
          groupName: group.name,
          name: modifier.name,
          priceDeltaCents: modifier.priceDeltaCents,
        })),
    );
    onAdd({ quantity, notes: notes.trim(), modifiers });
  }

  return (
    // Bottom sheet on phones (full width, up to nearly full height), centred
    // dialog from sm up. Tapping the backdrop dismisses it.
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modifier-picker-title"
        className="w-full sm:max-w-md bg-surface rounded-t-xl sm:rounded shadow-lg flex flex-col max-h-[92dvh] sm:max-h-[85dvh]"
      >
        <div className="flex items-center justify-between gap-2 p-4 border-b border-outline-variant shrink-0">
          <div className="min-w-0">
            <h2
              id="modifier-picker-title"
              className="font-headline-sm text-headline-sm text-on-surface"
            >
              {item.name}
            </h2>
            <p className="font-label-lg text-label-lg text-on-surface-variant">
              ${(item.priceCents / 100).toFixed(2)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="close" className="text-lg" />
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-4">
          {item.modifierGroups.map((group) => (
            <div key={group.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="font-label-lg text-label-lg text-on-surface">{group.name}</span>
                <span className="font-label-caps text-label-caps text-on-surface-variant">
                  {group.selectionType === "single" ? "Pick one" : "Pick any"}
                  {group.required ? " · required" : ""}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {group.modifiers.map((modifier) => {
                  const checked = (selectedByGroup[group.id] ?? []).includes(modifier.id);
                  return (
                    <button
                      type="button"
                      key={modifier.id}
                      aria-pressed={checked}
                      onClick={() => toggle(group.id, modifier.id, group.selectionType)}
                      className={cn(
                        "flex items-center justify-between gap-2 px-3 py-2 min-h-11 rounded border text-left",
                        checked
                          ? "border-primary bg-primary-container text-on-primary-container"
                          : "border-outline-variant hover:bg-surface-container-high",
                      )}
                    >
                      <span className="font-body-md text-body-md">{modifier.name}</span>
                      {modifier.priceDeltaCents !== 0 ? (
                        <span className="font-label-caps text-label-caps">
                          {modifier.priceDeltaCents > 0 ? "+" : ""}
                          {(modifier.priceDeltaCents / 100).toFixed(2)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex flex-col gap-2">
            <span className="font-label-lg text-label-lg text-on-surface">Notes</span>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. no onions"
              className="text-sm"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-outline-variant shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              aria-label="Decrease quantity"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Icon name="remove" className="text-base" />
            </Button>
            <span className="font-headline-sm text-headline-sm w-6 text-center">{quantity}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              aria-label="Increase quantity"
              onClick={() => setQuantity((q) => q + 1)}
            >
              <Icon name="add" className="text-base" />
            </Button>
          </div>
          <Button disabled={unmetRequired} onClick={handleAdd}>
            Add to order
          </Button>
        </div>
      </div>
    </div>
  );
}
