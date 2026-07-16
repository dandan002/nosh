"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import type { FloorSection, FloorTable } from "@/lib/data/floor";
import {
  SHAPE_MARKER,
  STATUS_LABEL,
  STATUS_MARKER,
  STATUS_ORDER,
  STATUS_SWATCH,
} from "@/lib/floor-plan-styles";
import { deleteTable, updateTablePosition } from "@/lib/actions/floor";
import { AddTableForm } from "@/components/floor/add-table-form";
import { SectionManager } from "@/components/floor/section-manager";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

function TableMarker({
  table,
  editMode,
  overridePos,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDelete,
}: {
  table: FloorTable;
  editMode: boolean;
  overridePos?: { x: number; y: number };
  onDragStart: (table: FloorTable, e: React.PointerEvent<HTMLDivElement>) => void;
  onDragMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDelete: (table: FloorTable) => Promise<void>;
}) {
  const [isDeleting, startTransition] = useTransition();
  const pos = overridePos ?? { x: table.posX, y: table.posY };

  return (
    <div
      className={cn("absolute group/table", editMode && "cursor-grab active:cursor-grabbing")}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={editMode ? (e) => onDragStart(table, e) : undefined}
      onPointerMove={editMode ? onDragMove : undefined}
      onPointerUp={editMode ? onDragEnd : undefined}
    >
      <div
        className={cn(
          "flex flex-col items-center justify-center shadow-sm transition-all",
          SHAPE_MARKER[table.shape],
          STATUS_MARKER[table.status],
        )}
      >
        <span className="font-headline-md text-headline-md">{table.label}</span>
        <span className="font-label-caps text-label-caps mt-1">
          {table.status === "dirty" ? "Bus" : `${table.seats} Seats`}
        </span>
      </div>
      {editMode ? (
        <button
          type="button"
          disabled={isDeleting}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-error text-on-error flex items-center justify-center opacity-0 group-hover/table:opacity-100 transition-opacity shadow-sm"
          onClick={() => {
            if (!window.confirm(`Delete table "${table.label}"?`)) return;
            startTransition(async () => {
              await onDelete(table);
            });
          }}
        >
          <Icon name="close" className="text-sm" />
        </button>
      ) : null}
    </div>
  );
}

export function FloorWorkspace({
  restaurantId,
  restaurantSlug,
  sections,
  activeSectionId,
  canEdit,
}: {
  restaurantId: string;
  restaurantSlug: string;
  sections: FloorSection[];
  activeSectionId: string | undefined;
  canEdit: boolean;
}) {
  const [editMode, setEditMode] = useState(false);
  const [showAddTable, setShowAddTable] = useState(false);
  const [dragOverrides, setDragOverrides] = useState<Record<string, { x: number; y: number }>>(
    {},
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeSection =
    sections.find((section) => section.id === activeSectionId) ?? sections[0];

  function clearOverride(tableId: string) {
    setDragOverrides((prev) => {
      if (!(tableId in prev)) return prev;
      const next = { ...prev };
      delete next[tableId];
      return next;
    });
  }

  function handleDragStart(table: FloorTable, e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.dataset.startX = String(e.clientX);
    e.currentTarget.dataset.startY = String(e.clientY);
    e.currentTarget.dataset.originX = String(table.posX);
    e.currentTarget.dataset.originY = String(table.posY);
    setDraggingId(table.id);
    setDragOverrides((prev) => ({ ...prev, [table.id]: { x: table.posX, y: table.posY } }));
  }

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingId) return;
    const el = e.currentTarget;
    const startX = Number(el.dataset.startX);
    const startY = Number(el.dataset.startY);
    const originX = Number(el.dataset.originX);
    const originY = Number(el.dataset.originY);
    const nextX = Math.max(0, Math.round(originX + (e.clientX - startX)));
    const nextY = Math.max(0, Math.round(originY + (e.clientY - startY)));
    setDragOverrides((prev) => ({ ...prev, [draggingId]: { x: nextX, y: nextY } }));
  }

  async function handleDragEnd() {
    if (!draggingId) return;
    const finalPos = dragOverrides[draggingId];
    const tableId = draggingId;
    setDraggingId(null);
    if (!finalPos) return;

    const result = await updateTablePosition(tableId, restaurantSlug, finalPos.x, finalPos.y);
    // Clear the local override either way: on success the next revalidated
    // fetch carries the same value; on failure this snaps the table back to
    // its last known-good server position instead of leaving it stuck at an
    // unpersisted spot.
    clearOverride(tableId);
    if (result?.error) {
      setActionError(result.error);
    }
  }

  async function handleDeleteTable(table: FloorTable) {
    const result = await deleteTable(table.id, restaurantSlug);
    if (result?.error) {
      setActionError(result.error);
    }
  }

  if (sections.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-on-surface-variant font-body-md text-body-md">
        <p>No floor plan set up yet.</p>
        {actionError ? (
          <p className="font-label-caps text-label-caps text-error">{actionError}</p>
        ) : null}
        {canEdit ? (
          <div className="w-80">
            <SectionManager
              sections={[]}
              restaurantId={restaurantId}
              restaurantSlug={restaurantSlug}
              onError={setActionError}
            />
          </div>
        ) : null}
      </div>
    );
  }

  const counts = STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = activeSection.tables.filter((table) => table.status === status).length;
      return acc;
    },
    {} as Record<(typeof STATUS_ORDER)[number], number>,
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 border-b border-outline-variant bg-surface flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-1">
            {sections.map((section) => (
              <Link
                key={section.id}
                href={`?section=${section.id}`}
                className={cn(
                  "px-3 py-1.5 rounded font-label-caps text-label-caps transition-colors",
                  section.id === activeSection.id
                    ? "bg-secondary-container text-on-secondary-container font-bold"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
                )}
              >
                {section.name}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4 font-label-caps text-label-caps text-on-surface-variant">
              {STATUS_ORDER.map((status) => (
                <div key={status} className="flex items-center gap-2">
                  <div className={cn("w-4 h-4", STATUS_SWATCH[status])} />
                  <span>
                    {STATUS_LABEL[status]} ({counts[status]})
                  </span>
                </div>
              ))}
            </div>
            {canEdit ? (
              <>
                <div className="h-6 w-px bg-outline-variant" />
                {editMode ? (
                  <Button size="sm" variant="outline" onClick={() => setShowAddTable((v) => !v)}>
                    <Icon name="add" className="text-base" /> Table
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant={editMode ? "secondary" : "outline"}
                  onClick={() => {
                    setEditMode((v) => !v);
                    setShowAddTable(false);
                  }}
                >
                  <Icon name="edit" className="text-base" />
                  {editMode ? "Done" : "Edit Layout"}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {actionError ? (
          <div className="px-6 py-2 border-b border-outline-variant bg-error/10 flex items-center justify-between gap-2">
            <p className="font-label-caps text-label-caps text-error">{actionError}</p>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-error"
            >
              <Icon name="close" className="text-sm" />
            </button>
          </div>
        ) : null}

        {showAddTable ? (
          <div className="px-6 py-3 border-b border-outline-variant bg-surface-container">
            <AddTableForm
              restaurantId={restaurantId}
              floorSectionId={activeSection.id}
              restaurantSlug={restaurantSlug}
              onDone={() => setShowAddTable(false)}
            />
          </div>
        ) : null}

        <div className="flex-1 relative overflow-auto floorplan-bg">
          {activeSection.tables.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-on-surface-variant font-body-md text-body-md">
              No tables in this section yet.
            </div>
          ) : (
            <div className="relative min-w-[1000px] min-h-[800px] p-8">
              {activeSection.tables.map((table) => (
                <TableMarker
                  key={table.id}
                  table={table}
                  editMode={editMode}
                  overridePos={dragOverrides[table.id]}
                  onDragStart={handleDragStart}
                  onDragMove={handleDragMove}
                  onDragEnd={handleDragEnd}
                  onDelete={handleDeleteTable}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {editMode ? (
        <SectionManager
          sections={sections}
          restaurantId={restaurantId}
          restaurantSlug={restaurantSlug}
          onError={setActionError}
        />
      ) : null}
    </div>
  );
}
