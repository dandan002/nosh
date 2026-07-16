"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logout } from "@/lib/actions/auth";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "floor", label: "Seating", icon: "event_seat", available: true },
  { href: "orders", label: "Orders", icon: "receipt_long", available: true },
  { href: "billing", label: "Billing", icon: "payments", available: false },
  { href: "admin/menu", label: "Menu", icon: "restaurant_menu", available: true },
  { href: "admin/analytics", label: "Analytics", icon: "analytics", available: false },
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

  return (
    <nav className="fixed left-0 top-0 h-full z-40 bg-surface-dim border-r border-outline-variant w-20 hover:w-64 transition-all duration-300 overflow-hidden flex flex-col group">
      <div className="px-4 py-6 border-b border-outline-variant flex items-center justify-start h-[88px] shrink-0 whitespace-nowrap">
        <span className="font-display-lg text-display-lg font-bold text-primary mr-3 shrink-0">
          r
        </span>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col">
          <span className="font-display-lg text-display-lg font-bold text-primary leading-none">
            ev
          </span>
          <span className="text-xs text-on-surface-variant mt-1 truncate">
            {restaurantName}
          </span>
        </div>
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
                <span className="font-label-lg text-label-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {item.label}
                </span>
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={href}
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
              <span className="font-label-lg text-label-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
          <span className="ml-3 font-label-lg text-label-lg text-on-surface opacity-0 group-hover:opacity-100 transition-opacity duration-200 truncate">
            {staffDisplayName}
          </span>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full text-on-surface-variant flex items-center px-2 py-2 hover:bg-surface-container-high hover:text-error rounded transition-colors whitespace-nowrap"
          >
            <Icon name="logout" className="shrink-0 mr-4 text-xl w-6 text-center" />
            <span className="font-label-lg text-label-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              Logout
            </span>
          </button>
        </form>
      </div>
    </nav>
  );
}
