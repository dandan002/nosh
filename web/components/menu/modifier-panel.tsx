"use client";

import { useActionState, useTransition } from "react";

import type { ModifierGroup } from "@/lib/data/menu";
import {
  createModifier,
  createModifierGroup,
  deleteModifier,
  deleteModifierGroup,
} from "@/lib/actions/menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icon";

function ModifierRow({
  modifier,
  restaurantSlug,
  onError,
}: {
  modifier: { id: string; name: string; priceDeltaCents: number };
  restaurantSlug: string;
  onError: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-2 py-1 pl-4">
      <span className="font-body-sm text-body-sm text-on-surface-variant">
        {modifier.name}
        {modifier.priceDeltaCents !== 0 ? (
          <span className="ml-2 text-on-surface-variant/70">
            {modifier.priceDeltaCents > 0 ? "+" : ""}
            {(modifier.priceDeltaCents / 100).toFixed(2)}
          </span>
        ) : null}
      </span>
      <Button
        variant="ghost"
        size="icon"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm(`Delete modifier "${modifier.name}"?`)) return;
          startTransition(async () => {
            const result = await deleteModifier(modifier.id, restaurantSlug);
            if (result?.error) onError(result.error);
          });
        }}
      >
        <Icon name="close" className="text-sm text-error" />
      </Button>
    </div>
  );
}

function AddModifierForm({
  restaurantId,
  groupId,
  restaurantSlug,
}: {
  restaurantId: string;
  groupId: string;
  restaurantSlug: string;
}) {
  const [state, formAction, pending] = useActionState(
    createModifier.bind(null, restaurantId, groupId, restaurantSlug),
    undefined,
  );

  return (
    <form action={formAction} className="flex items-center gap-2 pl-4 pt-1">
      <Input name="name" placeholder="Modifier name" required className="h-8 text-sm flex-1" />
      <Input
        name="priceDelta"
        type="number"
        step="0.01"
        placeholder="+0.00"
        defaultValue={0}
        required
        className="h-8 text-sm w-24"
      />
      <Button type="submit" size="sm" disabled={pending}>
        <Icon name="add" className="text-sm" />
      </Button>
      {state?.error || state?.fieldErrors ? (
        <p className="font-label-caps text-label-caps text-error">
          {state?.error ?? state?.fieldErrors?.name?.[0] ?? state?.fieldErrors?.priceDelta?.[0]}
        </p>
      ) : null}
    </form>
  );
}

function GroupPanel({
  group,
  restaurantId,
  restaurantSlug,
  onError,
}: {
  group: ModifierGroup;
  restaurantId: string;
  restaurantSlug: string;
  onError: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="border border-outline-variant rounded p-3 bg-surface">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-label-lg text-label-lg text-on-surface">{group.name}</span>
          <span className="font-label-caps text-label-caps text-on-surface-variant">
            {group.selectionType === "single" ? "pick one" : "pick any"}
            {group.required ? " · required" : ""}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={isPending}
          onClick={() => {
            if (
              !window.confirm(
                `Delete group "${group.name}"? This also deletes its ${group.modifiers.length} modifier(s).`,
              )
            ) {
              return;
            }
            startTransition(async () => {
              const result = await deleteModifierGroup(group.id, restaurantSlug);
              if (result?.error) onError(result.error);
            });
          }}
        >
          <Icon name="delete" className="text-base text-error" />
        </Button>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {group.modifiers.map((modifier) => (
          <ModifierRow
            key={modifier.id}
            modifier={modifier}
            restaurantSlug={restaurantSlug}
            onError={onError}
          />
        ))}
      </div>
      <AddModifierForm
        restaurantId={restaurantId}
        groupId={group.id}
        restaurantSlug={restaurantSlug}
      />
    </div>
  );
}

function AddGroupForm({
  restaurantId,
  menuItemId,
  restaurantSlug,
}: {
  restaurantId: string;
  menuItemId: string;
  restaurantSlug: string;
}) {
  const [state, formAction, pending] = useActionState(
    createModifierGroup.bind(null, restaurantId, menuItemId, restaurantSlug),
    undefined,
  );

  return (
    <form action={formAction} className="flex items-center gap-2 flex-wrap">
      <Input name="name" placeholder="Group name (e.g. Size)" required className="h-9 text-sm w-40" />
      <select
        name="selectionType"
        defaultValue="single"
        className="h-9 px-2 bg-surface-container-lowest border-b border-outline-variant rounded-t-DEFAULT font-body-sm text-body-sm text-on-surface"
      >
        <option value="single">Pick one</option>
        <option value="multiple">Pick any</option>
      </select>
      <label className="flex items-center gap-1 font-body-sm text-body-sm text-on-surface-variant">
        <input type="checkbox" name="required" /> Required
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        <Icon name="add" className="text-base" /> Group
      </Button>
      {state?.error || state?.fieldErrors ? (
        <p className="font-label-caps text-label-caps text-error">
          {state?.error ?? state?.fieldErrors?.name?.[0]}
        </p>
      ) : null}
    </form>
  );
}

export function ModifierPanel({
  groups,
  restaurantId,
  menuItemId,
  restaurantSlug,
  onError,
}: {
  groups: ModifierGroup[];
  restaurantId: string;
  menuItemId: string;
  restaurantSlug: string;
  onError: (message: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 pl-6 pt-2 pb-1">
      {groups.map((group) => (
        <GroupPanel
          key={group.id}
          group={group}
          restaurantId={restaurantId}
          restaurantSlug={restaurantSlug}
          onError={onError}
        />
      ))}
      <AddGroupForm
        restaurantId={restaurantId}
        menuItemId={menuItemId}
        restaurantSlug={restaurantSlug}
      />
    </div>
  );
}
