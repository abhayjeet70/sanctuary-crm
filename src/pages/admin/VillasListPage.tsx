import { Link } from "react-router-dom";
import { BedDouble, Users, ArrowRight } from "lucide-react";
import { PageHeader, StatusBadge, Eyebrow } from "@/components/common";
import { useBookings, useVillas } from "@/hooks/useData";
import { useMockData } from "@/hooks/useData";
import { bookingsOnDate } from "@/services/domain";
import { money } from "@/lib/format";

export default function VillasListPage() {
  const villas = useVillas();
  const bookings = useBookings();
  const { today } = useMockData();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Three houses on the ridge"
        title="Villas & rooms"
        description="Each villa can be sold whole or split into its four bedrooms. Switching mode changes what the calendar and the booking form will allow."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {villas.map((villa) => {
          const live = bookingsOnDate(bookings, villa.id, today);
          const occupied = live.length > 0;
          const split = villa.mode === "split";
          const occupiedRooms = split
            ? villa.rooms.filter((room) =>
                live.some((b) => b.roomIds.length === 0 || b.roomIds.includes(room.id)),
              ).length
            : occupied
              ? villa.bedrooms
              : 0;

          return (
            <article
              key={villa.id}
              className="group overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-gold/12 transition-all hover:shadow-lift hover:ring-gold/35"
            >
              <Link to={`/admin/villas/${villa.id}`} className="block">
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={villa.image}
                    alt={`${villa.name} seen from the approach`}
                    className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/20 to-transparent" />
                  <div className="absolute inset-x-4 bottom-3">
                    <h2 className="display-caps text-2xl text-white">{villa.name}</h2>
                    <p className="mt-1 text-xs text-sand/80">
                      {villa.bedrooms} bedrooms · sleeps {villa.capacity}
                    </p>
                  </div>
                  <div className="absolute top-3 right-3">
                    <StatusBadge
                      label={split ? "Split into rooms" : "Whole villa"}
                      tone={split ? "uploaded" : "confirmed"}
                    />
                  </div>
                </div>
              </Link>

              <div className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4 text-sm text-stone-600">
                    <span className="flex items-center gap-1.5">
                      <BedDouble className="size-4 text-gold-700" aria-hidden />
                      {villa.bedrooms}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="size-4 text-gold-700" aria-hidden />
                      {villa.capacity}
                    </span>
                  </div>
                  <StatusBadge
                    label={occupied ? "Occupied today" : "Available today"}
                    tone={occupied ? "inhouse" : "confirmed"}
                  />
                </div>

                <hr className="rule-gold" />

                <div>
                  <Eyebrow>Rate from</Eyebrow>
                  <p className="mt-1 font-display text-2xl text-ink tabular-nums">
                    {money(villa.baseRate)}
                    <span className="ml-1 font-sans text-sm font-normal text-stone-600">
                      / night
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-stone-600">
                    Weekend {money(villa.weekendRate)} · Seasonal {money(villa.seasonalRate)}
                  </p>
                </div>

                {/* Occupancy at a glance, room by room */}
                <div>
                  <Eyebrow className="mb-2">
                    Rooms — {occupiedRooms} of {villa.bedrooms} held
                  </Eyebrow>
                  <ul className="grid grid-cols-4 gap-1.5">
                    {villa.rooms.map((room) => {
                      const held = live.some(
                        (b) => b.roomIds.length === 0 || b.roomIds.includes(room.id),
                      );
                      return (
                        <li
                          key={room.id}
                          className={
                            held
                              ? "rounded-md bg-status-inhouse-bg py-1.5 text-center text-xs text-status-inhouse"
                              : "rounded-md bg-status-confirmed-bg py-1.5 text-center text-xs text-status-confirmed"
                          }
                          title={`${room.name} — ${held ? "held" : "free"} today`}
                        >
                          {room.name.replace("Room ", "")}
                          <span className="sr-only">
                            {" "}
                            {held ? "held today" : "free today"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <Link
                  to={`/admin/villas/${villa.id}`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-clay underline-offset-4 hover:underline"
                >
                  Manage villa
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
