"use client";

import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

// Server-rendered billing pages just need "refresh when checks/payments
// change" (e.g. the webhook marking a payment succeeded).
export function BillingRealtime({
  channelName,
  restaurantId,
  tables,
}: {
  channelName: string;
  restaurantId: string;
  tables: readonly string[];
}) {
  useRealtimeRefresh(channelName, restaurantId, tables);
  return null;
}
