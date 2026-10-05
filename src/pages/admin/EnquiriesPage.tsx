import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/common";
import { WaitlistBoard } from "@/components/admin/WaitlistBoard";
import { useBookingViews, useWaitlist } from "@/hooks/useData";
import { bookingSource } from "@/lib/status";
import { formatDateRange, money, nightsBetween, relativeTime } from "@/lib/format";
import { supabase } from "@/services/supabase/client";

/**
 * Everyone who has asked about a stay but has not been given one yet.
 *
 * Two kinds sit here: an enquiry for dates that are free (a booking still at
 * `inquiry`), and an enquiry for dates that are already sold (a waitlist
 * entry). They are different problems — one needs a price, the other needs a
 * cancellation — so they are kept apart rather than merged into one list.
 */
export default function EnquiriesPage() {
  const enquiries = useBookingViews().filter((v) => v.booking.status === "inquiry");
  const waiting = useWaitlist().filter((e) => e.status === "waiting");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Enquiries"
        description="Every guest who has asked about a stay and is still waiting to hear back."
        actions={
          <Button asChild size="sm">
            <Link to="/admin/bookings/new">
              <Plus aria-hidden />
              New enquiry
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open enquiries"
          value={enquiries.length}
          icon={<MessageCircle className="size-4" />}
        />
        <StatCard label="On the waiting list" value={waiting.length} hint="Dates already sold" />
        <StatCard
          label="Potential value"
          value={money(enquiries.reduce((sum, v) => sum + v.totals.total, 0))}
          hint="If every open enquiry converts"
        />
        <StatCard
          label="Oldest"
          value={
            enquiries.length
              ? relativeTime(
                  [...enquiries].sort((a, b) =>
                    a.booking.createdAt.localeCompare(b.booking.createdAt),
                  )[0].booking.createdAt,
                )
              : "—"
          }
          tone={enquiries.length ? "warn" : "default"}
        />
      </div>

      <section
        aria-labelledby="open"
        className="rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]"
      >
        <h2 id="open" className="px-6 pt-5 pb-3 text-xl text-ink">
          Awaiting a reply
        </h2>
        {enquiries.length === 0 ? (
          <EmptyState
            className="m-4"
            icon={<MessageCircle className="size-5" />}
            title="Nothing outstanding"
            description="Every enquiry has been quoted or turned into a booking."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/bookings/new">Record an enquiry</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-ink/8">
            {enquiries.map(({ booking, villa, customer, totals }) => (
              <li key={booking.id}>
                <Link
                  to={`/admin/bookings/${booking.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 transition-colors hover:bg-gold/6"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{customer?.name}</p>
                      <StatusBadge label={bookingSource[booking.source]} tone="uploaded" />
                    </div>
                    <p className="mt-0.5 text-sm text-stone-600">
                      {villa?.name} · {formatDateRange(booking.checkIn, booking.checkOut)} ·{" "}
                      {nightsBetween(booking.checkIn, booking.checkOut)} nights ·{" "}
                      {booking.adults + booking.children} guests
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm tabular-nums text-ink">{money(totals.total)}</p>
                    <p className="text-xs text-stone-600">
                      asked {relativeTime(booking.createdAt)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <WhatsAppChats />

      <section aria-labelledby="waitlist" className="space-y-4">
        <h2 id="waitlist" className="text-xl text-ink">
          Waiting list
        </h2>
        <WaitlistBoard />
      </section>
    </div>
  );
}

interface WhatsAppEnquiry {
  id: string;
  name: string;
  phone: string;
  email: string;
  villa_name: string;
  check_in: string | null;
  check_out: string | null;
  adults: number;
  children: number;
  estimate: number;
  message: string;
  handled: boolean;
  created_at: string;
}

/**
 * Everyone who pressed "Chat with us" in the booking window, with whatever
 * they had filled in by then — so the desk can pick the chat up knowing the
 * dates, the house and the price they were looking at.
 */
function WhatsAppChats() {
  const [rows, setRows] = useState<WhatsAppEnquiry[] | null>(null);
  const load = () =>
    void supabase
      .from("whatsapp_enquiries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setRows((data as WhatsAppEnquiry[]) ?? []));
  useEffect(load, []);

  const markHandled = async (id: string) => {
    const { error } = await supabase.from("whatsapp_enquiries").update({ handled: true }).eq("id", id);
    if (error) return toast.error("Could not update", { description: error.message });
    load();
  };

  const open = rows?.filter((r) => !r.handled) ?? [];

  return (
    <section aria-labelledby="whatsapp" className="rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]">
      <h2 id="whatsapp" className="px-6 pt-5 pb-3 text-xl text-ink">
        WhatsApp chats {open.length > 0 && <span className="text-base text-stone-600">· {open.length} new</span>}
      </h2>
      {open.length === 0 ? (
        <EmptyState
          className="m-4"
          icon={<MessageCircle className="size-5" />}
          title={rows === null ? "Loading…" : "No new chats"}
          description="Guests who tap “Chat with us” while booking appear here with their details."
        />
      ) : (
        <ul className="divide-y divide-ink/8">
          {open.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-6 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">
                  {r.name || "Unnamed guest"} {r.phone && <span className="text-sm text-stone-600">· {r.phone}</span>}
                </p>
                <p className="mt-0.5 text-sm text-stone-600">
                  {[
                    r.villa_name,
                    r.check_in && r.check_out && formatDateRange(r.check_in, r.check_out),
                    `${r.adults + r.children} guests`,
                    r.estimate > 0 && money(r.estimate),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-1 text-xs text-stone-600">asked {relativeTime(r.created_at)}</p>
              </div>
              <div className="flex gap-2">
                {r.phone && (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={`https://wa.me/${r.phone.replace(/D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Reply on WhatsApp
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void markHandled(r.id)}>
                  Mark handled
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
