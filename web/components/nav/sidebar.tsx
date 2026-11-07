"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { logout } from "@/lib/actions/auth";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "floor", label: "Seating", icon: "event_seat", available: true },
  { href: "orders", label: "Orders", icon: "receipt_long", available: true },
  { href: "kitchen", label: "Kitchen", icon: "soup_kitchen", available: true },
  { href: "billing", label: "Billing", icon: "payments", available: true },
  { href: "admin/menu", label: "Menu", icon: "restaurant_menu", available: true },
  { href: "admin/analytics", label: "Analytics", icon: "analytics", available: true },
  { href: "admin/settings", label: "Settings", icon: "settings", available: true },
] as const;

export function Sidebar({
  restaurantSlug,
  restaurantName,
  staffDisplayName,
}: {
  restaurantSlug: string;
  restaurantName: string;
  staffDisplayName: string;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  // Close the mobile drawer whenever the route changes (covers back/forward
  // as well as tapping a nav link). Adjusting state during render rather
  // than in an effect avoids a flash of the stale open drawer.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <>
      {/* Below md: a top bar with a menu button stands in for the hover rail,
          which is unusable on touch screens. */}
      <header className="md:hidden sticky top-0 z-30 h-14 shrink-0 bg-surface-dim border-b border-outline-variant flex items-center gap-2 px-2">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          aria-controls="app-nav"
          className="h-11 w-11 flex items-center justify-center rounded-DEFAULT text-on-surface hover:bg-surface-container-high"
        >
          <Icon name="menu" className="text-2xl" />
        </button>
        <span className="font-headline-sm text-headline-sm font-bold text-primary">rev</span>
        <span className="font-label-lg text-label-lg text-on-surface-variant truncate min-w-0">
          {restaurantName}
        </span>
      </header>

      <div
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-300",
          drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      />

      <nav
        id="app-nav"
        className={cn(
          "fixed left-0 top-0 h-dvh z-50 md:z-40 bg-surface-dim border-r border-outline-variant w-64 md:w-20 md:hover:w-64 transition-all duration-300 overflow-hidden flex flex-col group",
          // Off-canvas drawer below md; `invisible` keeps closed links out of
          // the tab order (visibility transitions discretely, so the slide-out
          // still animates).
          drawerOpen
            ? "max-md:translate-x-0 max-md:shadow-lg"
            : "max-md:-translate-x-full max-md:invisible",
        )}
      >
        <div className="px-4 py-6 border-b border-outline-variant flex items-center justify-start h-[88px] shrink-0 whitespace-nowrap">
          <span className="font-display-lg text-display-lg font-bold text-primary mr-3 shrink-0">
            r
          </span>
          <div className="md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 flex flex-col">
            <span className="font-display-lg text-display-lg font-bold text-primary leading-none">
              ev
            </span>
            <span className="text-xs text-on-surface-variant mt-1 truncate">
              {restaurantName}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            className="md:hidden ml-auto h-11 w-11 flex items-center justify-center rounded-DEFAULT text-on-surface-variant hover:bg-surface-container-high"
          >
            <Icon name="close" className="text-xl" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const href = `/${restaurantSlug}/${item.href}`;
            const active = pathname.startsWith(href);

            if (!item.available) {
              return (
                <span
                  key={item.href}
                  className="text-on-surface-variant/40 flex items-center px-4 py-3 whitespace-nowrap cursor-not-allowed"
                  title="Coming soon"
                >
                  <Icon name={item.icon} className="shrink-0 mr-4 text-xl w-6 text-center" />
                  <span className="font-label-lg text-label-lg md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                    {item.label}
                  </span>
                </span>
              );
            }

            return (
              <Link
                key={item.href}
                href={href}
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  "flex items-center px-4 py-3 transition-all duration-200 ease-in-out whitespace-nowrap",
                  active
                    ? "text-on-secondary-container font-bold border-l-4 border-primary bg-secondary-container"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
                )}
              >
                <Icon
                  name={item.icon}
                  className={cn("shrink-0 mr-4 text-xl w-6 text-center", active && "-ml-1")}
                />
                <span className="font-label-lg text-label-lg md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-outline-variant shrink-0 space-y-1 bg-surface-container-low">
          <div className="flex items-center px-2 py-2 whitespace-nowrap">
            <div className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center shrink-0">
              <Icon name="person" className="text-on-surface-variant text-lg" />
            </div>
            <span className="ml-3 font-label-lg text-label-lg text-on-surface md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 truncate">
              {staffDisplayName}
            </span>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="w-full text-on-surface-variant flex items-center px-2 py-2 hover:bg-surface-container-high hover:text-error rounded transition-colors whitespace-nowrap"
            >
              <Icon name="logout" className="shrink-0 mr-4 text-xl w-6 text-center" />
              <span className="font-label-lg text-label-lg md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                Logout
              </span>
            </button>
          </form>
        </div>
      </nav>
    </>
  );
}
