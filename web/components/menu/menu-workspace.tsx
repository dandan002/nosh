"use client";

import { useState } from "react";

import type { MenuCategory } from "@/lib/data/menu";
import { CategoryManager } from "@/components/menu/category-manager";
import { ItemForm } from "@/components/menu/item-form";
import { ItemRow } from "@/components/menu/item-row";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

export function MenuWorkspace({
  restaurantId,
  restaurantSlug,
  categories,
  canEdit,
}: {
  restaurantId: string;
  restaurantSlug: string;
  categories: MenuCategory[];
  canEdit: boolean;
}) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(
    categories[0]?.id,
  );
  const [showAddItem, setShowAddItem] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeCategory =
    categories.find((category) => category.id === activeCategoryId) ?? categories[0];

  if (categories.length === 0) {
    return (
      <div className="flex-1 flex overflow-hidden">
        {canEdit ? (
          <CategoryManager
            categories={[]}
            restaurantId={restaurantId}
            restaurantSlug={restaurantSlug}
            activeCategoryId={undefined}
            onSelect={setActiveCategoryId}
            onError={setActionError}
          />
        ) : null}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-on-surface-variant font-body-md text-body-md">
          <p>No menu categories yet.</p>
          {actionError ? (
            <p className="font-label-caps text-label-caps text-error">{actionError}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {canEdit ? (
        <CategoryManager
          categories={categories}
          restaurantId={restaurantId}
          restaurantSlug={restaurantSlug}
          activeCategoryId={activeCategory?.id}
          onSelect={(id) => {
            setActiveCategoryId(id);
            setShowAddItem(false);
          }}
          onError={setActionError}
        />
      ) : null}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 border-b border-outline-variant bg-surface flex items-center justify-between px-6 shrink-0">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            {activeCategory?.name}
          </h2>
          {canEdit && activeCategory ? (
            <Button size="sm" variant="outline" onClick={() => setShowAddItem((v) => !v)}>
              <Icon name="add" className="text-base" /> Item
            </Button>
          ) : null}
        </div>

        {actionError ? (
          <div className="px-6 py-2 border-b border-outline-variant bg-error/10 flex items-center justify-between gap-2">
            <p className="font-label-caps text-label-caps text-error">{actionError}</p>
            <button type="button" onClick={() => setActionError(null)} className="text-error">
              <Icon name="close" className="text-sm" />
            </button>
          </div>
        ) : null}

        <div className="flex-1 overflow-auto p-6 flex flex-col gap-3">
          {showAddItem && activeCategory ? (
            <ItemForm
              restaurantId={restaurantId}
              categoryId={activeCategory.id}
              restaurantSlug={restaurantSlug}
              onDone={() => setShowAddItem(false)}
            />
          ) : null}

          {activeCategory?.items.length === 0 && !showAddItem ? (
            <p className="text-on-surface-variant font-body-md text-body-md">
              No items in this category yet.
            </p>
          ) : (
            activeCategory?.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                restaurantId={restaurantId}
                categoryId={activeCategory.id}
                restaurantSlug={restaurantSlug}
                canEdit={canEdit}
                onError={setActionError}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
