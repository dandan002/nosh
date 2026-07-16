"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import type { FloorSection } from "@/lib/data/floor";
import {
  createFloorSection,
  deleteFloorSection,
  renameFloorSection,
} from "@/lib/actions/floor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icon";

function SectionRow({
  section,
  restaurantSlug,
  onError,
}: {
  section: FloorSection;
  restaurantSlug: string;
  onError: (message: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState(
    renameFloorSection.bind(null, section.id, restaurantSlug),
    undefined,
  );
  const wasPending = useRef(false);

  // Close the rename form only once a submission completes *successfully* —
  // watching pending's true->false transition rather than unconditionally
  // closing on submit, so a validation/RLS error stays visible instead of
  // the form collapsing back to read-only view before it can be read.
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error && !state?.fieldErrors) {
      setRenaming(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  if (renaming) {
    return (
      <form action={formAction} className="flex items-center gap-2">
        <Input
          name="name"
          defaultValue={section.name}
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
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="font-body-md text-body-md text-on-surface">
        {section.name}{" "}
        <span className="text-on-surface-variant">({section.tables.length})</span>
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setRenaming(true)}>
          <Icon name="edit" className="text-base" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={isPending}
          onClick={() => {
            if (
              !window.confirm(
                `Delete "${section.name}"? This also deletes its ${section.tables.length} table(s).`,
              )
            ) {
              return;
            }
            startTransition(async () => {
              const result = await deleteFloorSection(section.id, restaurantSlug);
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

export function SectionManager({
  sections,
  restaurantId,
  restaurantSlug,
  onError,
}: {
  sections: FloorSection[];
  restaurantId: string;
  restaurantSlug: string;
  onError?: (message: string) => void;
}) {
  const [state, formAction, pending] = useActionState(
    createFloorSection.bind(null, restaurantId, restaurantSlug),
    undefined,
  );

  return (
    <div className="w-80 bg-surface border-l border-outline-variant flex flex-col shrink-0 p-4 gap-4">
      <h2 className="font-headline-sm text-headline-sm text-on-surface">Sections</h2>
      <div className="flex flex-col gap-1 divide-y divide-outline-variant">
        {sections.map((section) => (
          <SectionRow
            key={section.id}
            section={section}
            restaurantSlug={restaurantSlug}
            onError={onError ?? (() => {})}
          />
        ))}
      </div>
      <form action={formAction} className="flex items-start gap-2 pt-2 border-t border-outline-variant">
        <div className="flex-1">
          <Input name="name" placeholder="New section name" required className="h-9 text-sm" />
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
