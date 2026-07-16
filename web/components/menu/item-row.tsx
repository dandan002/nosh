"use client";

import { useState, useTransition } from "react";

import type { MenuItem } from "@/lib/data/menu";
import { deleteMenuItem, setMenuItemActive } from "@/lib/actions/menu";
import { ItemForm } from "@/components/menu/item-form";
import { ModifierPanel } from "@/components/menu/modifier-panel";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ItemRow({
  item,
  restaurantId,
  categoryId,
  restaurantSlug,
  canEdit,
  onError,
}: {
  item: MenuItem;
  restaurantId: string;
  categoryId: string;
  restaurantSlug: string;
  canEdit: boolean;
  onError: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <ItemForm
        restaurantId={restaurantId}
        categoryId={categoryId}
        restaurantSlug={restaurantSlug}
        item={item}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="border border-outline-variant rounded overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-3 bg-surface">
        <button
          type="button"
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <Icon
            name={expanded ? "expand_more" : "chevron_right"}
            className="text-on-surface-variant shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "font-body-lg text-body-lg text-on-surface",
                  !item.active && "opacity-50 line-through",
                )}
              >
                {item.name}
              </span>
              <span className="font-label-lg text-label-lg text-on-surface-variant">
                {formatPrice(item.priceCents)}
              </span>
              {item.modifierGroups.length > 0 ? (
                <span className="font-label-caps text-label-caps text-on-surface-variant/70">
                  {item.modifierGroups.length} modifier group
                  {item.modifierGroups.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            {item.description ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                {item.description}
              </p>
            ) : null}
          </div>
        </button>

        {canEdit ? (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              disabled={isPending}
              title={item.active ? "Mark unavailable" : "Mark available"}
              onClick={() => {
                startTransition(async () => {
                  const result = await setMenuItemActive(
                    item.id,
                    restaurantSlug,
                    !item.active,
                  );
                  if (result?.error) onError(result.error);
                });
              }}
            >
              <Icon name={item.active ? "visibility" : "visibility_off"} className="text-base" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setEditing(true)}>
              <Icon name="edit" className="text-base" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={isPending}
              onClick={() => {
                if (!window.confirm(`Delete "${item.name}"?`)) return;
                startTransition(async () => {
                  const result = await deleteMenuItem(item.id, restaurantSlug);
                  if (result?.error) onError(result.error);
                });
              }}
            >
              <Icon name="delete" className="text-base text-error" />
            </Button>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t border-outline-variant bg-surface-container-low">
          {canEdit ? (
            <ModifierPanel
              groups={item.modifierGroups}
              restaurantId={restaurantId}
              menuItemId={item.id}
              restaurantSlug={restaurantSlug}
              onError={onError}
            />
          ) : item.modifierGroups.length > 0 ? (
            <div className="flex flex-col gap-2 pl-6 py-2 pr-3">
              {item.modifierGroups.map((group) => (
                <div key={group.id} className="text-body-sm font-body-sm text-on-surface-variant">
                  {group.name}: {group.modifiers.map((m) => m.name).join(", ")}
                </div>
              ))}
            </div>
          ) : (
            <p className="p-3 font-body-sm text-body-sm text-on-surface-variant">
              No modifiers for this item.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
