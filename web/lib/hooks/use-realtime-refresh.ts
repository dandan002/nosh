"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

// Shared by the kitchen board, floor plan, and order-entry table picker —
// each just wants "re-fetch this Server Component's data whenever one of
// these tables changes for this restaurant," not the raw payload (none of
// them have the joined shape a postgres_changes row carries on its own).
//
// This also centralizes a bug found once already (see PLAN.md, kitchen
// display phase): postgres_changes is RLS-checked against the realtime
// socket's own auth token, and that token isn't set yet by the time a
// channel is created on a fresh page load if you don't wait for it —
// subscribing too early silently connects as anon, and RLS drops every
// event with no error. Awaiting the session and calling
// supabase.realtime.setAuth() before subscribing avoids that race. Fixing
// it in one shared place means the next realtime consumer doesn't have to
// rediscover it.
export function useRealtimeRefresh(
  channelName: string,
  restaurantId: string,
  tables: readonly string[],
) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableKey = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    function scheduleRefresh() {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 200);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);

      let builder = supabase.channel(channelName);
      for (const table of tableKey.split(",")) {
        builder = builder.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: `restaurant_id=eq.${restaurantId}`,
          },
          scheduleRefresh,
        );
      }
      channel = builder.subscribe();
    });

    return () => {
      cancelled = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (!channel) return;
      supabase.removeChannel(channel);
    };
  }, [channelName, restaurantId, tableKey, router]);
}
