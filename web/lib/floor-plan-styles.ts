import type { TableShape, TableStatus } from "@/lib/data/floor";

// Presentation for table status/shape, shared by any screen that needs the
// same vocabulary (floor visualization today; the admin editor and
// order-entry table picker will need it next). Kept separate from
// lib/data/floor.ts (which is server-only) since these are plain constants
// a client component could also import.

export const STATUS_ORDER: TableStatus[] = ["available", "occupied", "reserved", "dirty"];

export const STATUS_LABEL: Record<TableStatus, string> = {
  available: "Available",
  occupied: "Occupied",
  reserved: "Reserved",
  dirty: "Dirty",
};

export const STATUS_SWATCH: Record<TableStatus, string> = {
  available: "rounded-full border-2 border-primary",
  occupied: "rounded-full bg-primary-container border-2 border-primary-container",
  reserved: "rounded-full border-2 border-primary border-dashed",
  dirty: "rounded-full bg-surface-variant border-2 border-surface-variant",
};

export const STATUS_MARKER: Record<TableStatus, string> = {
  available: "bg-surface border-2 border-primary text-primary hover:bg-primary/10",
  occupied:
    "bg-primary-container border-4 border-primary-container text-on-primary-container shadow-md hover:brightness-110",
  reserved: "bg-surface border-2 border-primary border-dashed text-primary hover:bg-primary/5",
  dirty: "bg-surface-variant border-2 border-surface-variant text-on-surface-variant opacity-80",
};

export const SHAPE_MARKER: Record<TableShape, string> = {
  round: "w-24 h-24 rounded-full",
  square: "w-24 h-24 rounded",
  rectangle: "w-36 h-20 rounded",
};
