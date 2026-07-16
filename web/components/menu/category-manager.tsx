"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import type { MenuCategory } from "@/lib/data/menu";
import {
  createMenuCategory,
  deleteMenuCategory,
  renameMenuCategory,
} from "@/lib/actions/menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

function CategoryRow({
  category,
  active,
  restaurantSlug,
  onSelect,
  onError,
}: {
  category: MenuCategory;
  active: boolean;
  restaurantSlug: string;
  onSelect: () => void;
  onError: (message: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState(
    renameMenuCategory.bind(null, category.id, restaurantSlug),
    undefined,
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error && !state?.fieldErrors) {
      setRenaming(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  if (renaming) {
    return (
      <form action={formAction} className="flex items-center gap-2 py-1">
        <Input
          name="name"
          defaultValue={category.name}
          required
          autoFocus
          className="h-9 text-sm flex-1"
        />
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(false)}>
          Cancel
        </Button>
        {state?.error ? (
          <p className="font-label-caps text-label-caps text-error">{state.error}</p>
        ) : null}
      </form>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 py-2 px-3 rounded-DEFAULT cursor-pointer group",
        active
          ? "bg-secondary-container text-on-secondary-container font-bold"
          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
      )}
      onClick={onSelect}
    >
      <span className="font-body-md text-body-md">
        {category.name}{" "}
        <span className="opacity-70">({category.items.length})</span>
      </span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            setRenaming(true);
          }}
        >
          <Icon name="edit" className="text-base" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={isPending}
          onClick={(e) => {
            e.stopPropagation();
            if (
              !window.confirm(
                `Delete "${category.name}"? This also deletes its ${category.items.length} item(s).`,
              )
            ) {
              return;
            }
            startTransition(async () => {
              const result = await deleteMenuCategory(category.id, restaurantSlug);
              if (result?.error) {
                onError(result.error);
              }
            });
          }}
        >
          <Icon name="delete" className="text-base text-error" />
        </Button>
      </div>
    </div>
  );
}

export function CategoryManager({
  categories,
  restaurantId,
  restaurantSlug,
  activeCategoryId,
  onSelect,
  onError,
}: {
  categories: MenuCategory[];
  restaurantId: string;
  restaurantSlug: string;
  activeCategoryId: string | undefined;
  onSelect: (categoryId: string) => void;
  onError: (message: string) => void;
}) {
  const [state, formAction, pending] = useActionState(
    createMenuCategory.bind(null, restaurantId, restaurantSlug),
    undefined,
  );

  return (
    <div className="w-72 bg-surface border-r border-outline-variant flex flex-col shrink-0 p-4 gap-2">
      <h2 className="font-headline-sm text-headline-sm text-on-surface px-1 mb-1">
        Categories
      </h2>
      <div className="flex flex-col gap-1">
        {categories.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            active={category.id === activeCategoryId}
            restaurantSlug={restaurantSlug}
            onSelect={() => onSelect(category.id)}
            onError={onError}
          />
        ))}
      </div>
      <form action={formAction} className="flex items-start gap-2 pt-3 mt-1 border-t border-outline-variant">
        <div className="flex-1">
          <Input name="name" placeholder="New category" required className="h-9 text-sm" />
          {state?.fieldErrors?.name ? (
            <p className="font-label-caps text-label-caps text-error mt-1">
              {state.fieldErrors.name[0]}
            </p>
          ) : null}
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          <Icon name="add" className="text-base" />
        </Button>
      </form>
      {state?.error ? (
        <p className="font-label-caps text-label-caps text-error">{state.error}</p>
      ) : null}
    </div>
  );
}
