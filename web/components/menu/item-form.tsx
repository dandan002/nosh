"use client";

import { useActionState, useEffect, useRef } from "react";

import type { MenuItem } from "@/lib/data/menu";
import { createMenuItem, updateMenuItem } from "@/lib/actions/menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function centsToDollarsInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function ItemForm({
  restaurantId,
  categoryId,
  restaurantSlug,
  item,
  onDone,
}: {
  restaurantId: string;
  categoryId: string;
  restaurantSlug: string;
  item?: MenuItem;
  onDone: () => void;
}) {
  const action = item
    ? updateMenuItem.bind(null, item.id, restaurantSlug)
    : createMenuItem.bind(null, restaurantId, categoryId, restaurantSlug);
  const [state, formAction, pending] = useActionState(action, undefined);
  const wasPending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Only auto-close the *edit* form on a successful submission (mirrors
  // components/floor/section-manager.tsx's rename form, so a validation or
  // RLS error stays visible instead of collapsing before it's read). The
  // *add* form intentionally stays open on success — same reasoning as
  // components/floor/add-table-form.tsx — so adding several items in a row
  // doesn't require reopening the form each time — but it does reset its
  // fields so the next item doesn't start pre-filled with the last one.
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error && !state?.fieldErrors) {
      if (item) {
        onDone();
      } else {
        formRef.current?.reset();
      }
    }
    wasPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 p-4 bg-surface-container-low border border-outline-variant rounded"
    >
      <div className="flex items-start gap-3">
        <div className="flex-[2]">
          <Input
            name="name"
            placeholder="Item name"
            defaultValue={item?.name}
            required
            autoFocus
            className="text-sm"
          />
          {state?.fieldErrors?.name ? (
            <p className="font-label-caps text-label-caps text-error mt-1">
              {state.fieldErrors.name[0]}
            </p>
          ) : null}
        </div>
        <div className="w-28">
          <Input
            name="price"
            type="number"
            step="0.01"
            min={0}
            placeholder="0.00"
            defaultValue={item ? centsToDollarsInput(item.priceCents) : undefined}
            required
            className="text-sm"
          />
          {state?.fieldErrors?.price ? (
            <p className="font-label-caps text-label-caps text-error mt-1">
              {state.fieldErrors.price[0]}
            </p>
          ) : null}
        </div>
      </div>
      <Input
        name="description"
        placeholder="Description (optional)"
        defaultValue={item?.description ?? ""}
        className="text-sm"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving..." : item ? "Save" : "Add item"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        {state?.error ? (
          <p className="font-label-caps text-label-caps text-error">{state.error}</p>
        ) : null}
      </div>
    </form>
  );
}
