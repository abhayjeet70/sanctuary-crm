import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Hourglass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickWaitlistForm } from "@/components/guest/QuickWaitlistForm";
import {
  EmptyState,
  Eyebrow,
  Photo,
  PreferenceBadges,
  StatusBadge,
} from "@/components/common";
import { useMockData, useStayPreferences, useVillas, useWaitlist } from "@/hooks/useData";
import { supabase } from "@/services/supabase/client";
import { formatDateRange, formatDateTime, nightsBetween } from "@/lib/format";
import { hasPreferences } from "@/lib/preferences";
import type { Tone } from "@/lib/status";
import type { WaitlistStatus } from "@/types";

const STATE: Record<WaitlistStatus, { label: string; tone: Tone }> = {
  waiting: { label: "Waiting", tone: "pending" },
  offered: { label: "Offered to you", tone: "uploaded" },
  converted: { label: "Booked", tone: "confirmed" },
  expired: { label: "Lapsed", tone: "completed" },
  cancelled: { label: "Withdrawn", tone: "cancelled" },
};

/**
 * What the guest is waiting for, and where they stand.
 *
 * Position comes from `waitlist_position` rather than from counting rows: RLS
 * means this page can only see the guest's own entries, so counting here would
 * answer "1" every time and be a lie the first time somebody was third.
 */
export default function GuestWaitlistPage() {
  const entries = useWaitlist();
  const villas = useVillas();
  const preferences = useStayPreferences();
  const { updateWaitlistEntry } = useMockData();
  const [positions, setPositions] = useState<Record<string, number>>({});

  const waitingIds = entries
    .filter((entry) => entry.status === "waiting")
    .map((entry) => entry.id)
    .join(",");

  useEffect(() => {
    if (!waitingIds) return;
    let cancelled = false;

    void (async () => {
      const found: Record<string, number> = {};
      for (const id of waitingIds.split(",")) {
        const { data } = await supabase.rpc("waitlist_position", { p_waitlist_id: id });
        if (typeof data === "number") found[id] = data;
      }
      if (!cancelled) setPositions(found);
    })();

    return () => {
      cancelled = true;
    };
  }, [waitingIds]);

  if (entries.length === 0) {
    return (
      <div className="p-5 sm:p-8">
        <EmptyState
          icon={<Hourglass className="size-5" />}
          title="You are not waiting for anything"
          description="If the dates you want are already taken, we will offer to put your name down."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/guest/book">Plan a stay</Link>
            </Button>
          }
        />
        <div className="mt-6">
          <QuickWaitlistForm />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-5 sm:p-8">
      <header>
        <Eyebrow className="text-gold-700">Waiting list</Eyebrow>
        <h1 className="display-caps mt-2 text-3xl text-ink sm:text-4xl">
          You are on the list
        </h1>
        <p className="mt-2 max-w-lg text-sm text-stone-600">
          First come, first served. If a house is released for your dates we work down
          the list in the order people joined it — and we already have everything you
          told us, so there is nothing to fill in again.
        </p>
      </header>

      <QuickWaitlistForm />

      <ul className="space-y-4">
        {entries.map((entry) => {
          const villa = villas.find((v) => v.id === entry.villaId);
          const state = STATE[entry.status];
          const prefs = preferences.find((p) => p.waitlistId === entry.id);
          const position = positions[entry.id];

          return (
            <li
              key={entry.id}
              className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-ink/[0.07]"
            >
              <div className="relative h-32 sm:h-40">
                <Photo
                  src={villa?.image}
                  alt={villa?.name ?? "Any house"}
                  className="size-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/85 to-transparent" />
                <div className="absolute inset-x-5 bottom-4 flex flex-wrap items-end justify-between gap-3">
                  <h2 className="font-display text-2xl text-white">
                    {villa?.name ?? "Any house"}
                  </h2>
                  <StatusBadge label={state.label} tone={state.tone} />
                </div>
              </div>

              <div className="space-y-4 p-5 sm:p-6">
                {entry.status === "waiting" && position && (
                  <p className="rounded-xl bg-sand-200/70 px-4 py-3 text-sm text-ink">
                    You are <span className="font-medium">number {position}</span> in the
                    queue for these dates.
                  </p>
                )}

                <dl className="grid gap-4 sm:grid-cols-3">
                  <Detail label="Dates">
                    {formatDateRange(entry.checkIn, entry.checkOut)}
                    <span className="block text-xs text-stone-600">
                      {nightsBetween(entry.checkIn, entry.checkOut)} nights
                    </span>
                  </Detail>
                  <Detail label="Guests">
                    {entry.adults} {entry.adults === 1 ? "adult" : "adults"}
                    {entry.children > 0 &&
                      ` + ${entry.children} ${entry.children === 1 ? "child" : "children"}`}
                  </Detail>
                  <Detail label="Joined">{formatDateTime(entry.createdAt)}</Detail>
                  {(entry.checkInTime || entry.checkOutTime) && (
                    <Detail label="Times you asked for">
                      {entry.checkInTime && `Arriving ${entry.checkInTime}`}
                      {entry.checkInTime && entry.checkOutTime && " · "}
                      {entry.checkOutTime && `leaving ${entry.checkOutTime}`}
                    </Detail>
                  )}
                </dl>

                {hasPreferences(prefs) && (
                  <div>
                    <Eyebrow className="mb-2 text-gold-700">What we have noted</Eyebrow>
                    <PreferenceBadges preferences={prefs} />
                    {prefs?.foodNotes && (
                      <p className="mt-2 text-sm text-stone-600">{prefs.foodNotes}</p>
                    )}
                  </div>
                )}

                {entry.note && (
                  <div>
                    <Eyebrow className="mb-1 text-gold-700">Your note</Eyebrow>
                    <p className="text-sm text-ink">{entry.note}</p>
                  </div>
                )}

                {entry.status === "waiting" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      updateWaitlistEntry(entry.id, { status: "cancelled" });
                      toast.success("Taken off the list");
                    }}
                  >
                    <X aria-hidden />
                    Take me off the list
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}
