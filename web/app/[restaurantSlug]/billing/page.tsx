import Link from "next/link";

import { getRestaurantForSlug, isServerOrAbove } from "@/lib/data/restaurant";
import { getBillingOverview, getBillingSettings } from "@/lib/data/billing";
import { formatMoney } from "@/lib/billing/split";
import { OpenCheckButton } from "@/components/billing/open-check-button";
import { BillingRealtime } from "@/components/billing/billing-realtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/icon";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default async function BillingPage({
  params,
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const { restaurant, staffMember } = await getRestaurantForSlug(restaurantSlug);
  const [{ sessions, recentlyClosed }, settings] = await Promise.all([
    getBillingOverview(restaurant.id),
    getBillingSettings(restaurant.id),
  ]);
  const canBill = isServerOrAbove(staffMember.role);
  const paymentsReady = settings.stripeAccount?.chargesEnabled ?? false;

  return (
    <div className="flex flex-col min-h-[calc(100dvh-3.5rem)] md:min-h-dvh">
      <BillingRealtime
        channelName={`billing-overview-${restaurant.id}`}
        restaurantId={restaurant.id}
        tables={["checks", "payments", "table_sessions"]}
      />
      <header className="h-16 border-b border-outline-variant flex items-center px-4 md:px-6 shrink-0">
        <h1 className="font-headline-sm text-headline-sm text-on-surface truncate">
          {restaurant.name} &middot; Billing
        </h1>
      </header>

      <main className="flex-1 p-4 md:p-6 flex flex-col gap-6 max-w-5xl w-full">
        {!paymentsReady ? (
          <div className="flex items-start gap-3 p-4 rounded border border-secondary-container bg-secondary-fixed/40">
            <Icon name="info" className="text-secondary text-xl shrink-0" />
            <p className="font-body-md text-body-md text-on-surface">
              Card payments aren&apos;t enabled yet. You can still build and split checks; an
              owner or admin needs to finish Stripe onboarding in{" "}
              <Link href={`/${restaurantSlug}/admin/settings`} className="underline text-primary">
                Settings
              </Link>{" "}
              before payments can be collected.
            </p>
          </div>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            Open tables ({sessions.length})
          </h2>
          {sessions.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">
              No seated tables right now.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sessions.map((session) => (
                <Card key={session.id}>
                  <CardHeader>
                    <CardTitle>Table {session.tableLabel}</CardTitle>
                    <span className="font-label-caps text-label-caps text-on-surface-variant">
                      Seated {timeLabel(session.openedAt)}
                    </span>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Party of {session.partySize}
                      </p>
                      <p className="font-headline-sm text-headline-sm text-on-surface">
                        {session.openCheck ? formatMoney(session.openCheck.totalCents) : "No check yet"}
                      </p>
                    </div>
                    {canBill ? (
                      <OpenCheckButton
                        restaurantSlug={restaurantSlug}
                        sessionId={session.id}
                        label={session.openCheck ? "Open check" : "Generate check"}
                      />
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            Closed in the last 24 hours
          </h2>
          {recentlyClosed.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-outline-variant border border-outline-variant rounded bg-surface-container-lowest">
              {recentlyClosed.map((check) => (
                <li key={check.id}>
                  <Link
                    href={`/${restaurantSlug}/billing/${check.id}`}
                    className="flex items-center justify-between gap-3 px-4 min-h-14 hover:bg-surface-container-high"
                  >
                    <span className="font-body-md text-body-md text-on-surface">
                      Table {check.tableLabel}
                    </span>
                    <span className="flex items-center gap-4">
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        {timeLabel(check.closedAt)}
                      </span>
                      <span className="font-label-lg text-label-lg text-on-surface">
                        {formatMoney(check.totalCents)}
                      </span>
                      <Icon name="chevron_right" className="text-on-surface-variant" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
