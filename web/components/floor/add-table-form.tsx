"use client";

import { useActionState } from "react";

import { createTable } from "@/lib/actions/floor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icon";

const SHAPE_OPTIONS = [
  { value: "round", label: "Round" },
  { value: "square", label: "Square" },
  { value: "rectangle", label: "Rectangle" },
] as const;

export function AddTableForm({
  restaurantId,
  floorSectionId,
  restaurantSlug,
  onDone,
}: {
  restaurantId: string;
  floorSectionId: string;
  restaurantSlug: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    createTable.bind(null, restaurantId, floorSectionId, restaurantSlug),
    undefined,
  );

  return (
    <form
      action={formAction}
      className="flex items-end gap-2 p-3 bg-surface-container-low border border-outline-variant rounded"
    >
      <div className="w-20">
        <Input name="label" placeholder="T6" required className="text-sm" />
        {state?.fieldErrors?.label ? (
          <p className="font-label-caps text-label-caps text-error mt-1">
            {state.fieldErrors.label[0]}
          </p>
        ) : null}
      </div>
      <div className="w-16">
        <Input
          name="seats"
          type="number"
          min={1}
          max={30}
          defaultValue={4}
          required
          className="text-sm"
        />
        {state?.fieldErrors?.seats ? (
          <p className="font-label-caps text-label-caps text-error mt-1">
            {state.fieldErrors.seats[0]}
          </p>
        ) : null}
      </div>
      <select
        name="shape"
        defaultValue="round"
        className="h-[52px] px-3 bg-surface-container-lowest border-b border-outline-variant rounded-t-DEFAULT font-body-md text-body-md text-on-surface"
      >
        {SHAPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Adding..." : "Add"}
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={onDone}>
        <Icon name="close" className="text-lg" />
      </Button>
      {state?.error ? (
        <p className="font-label-caps text-label-caps text-error">{state.error}</p>
      ) : null}
    </form>
  );
}
