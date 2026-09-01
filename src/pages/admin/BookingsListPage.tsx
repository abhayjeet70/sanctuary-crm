import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, Plus, Rows3, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, PageHeader, StatusBadge } from "@/components/common";
import { useBookingViews, useVillas } from "@/hooks/useData";
import { bookingSource, bookingStatus, paymentStatus, sourceOptions } from "@/lib/status";
import { formatDateRange, formatShortDate, money, nightsBetween } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BookingView } from "@/hooks/useData";

const ALL = "all";

export default function BookingsListPage() {
  const views = useBookingViews();
  const villas = useVillas();

  const [search, setSearch] = useState("");
  const [villaId, setVillaId] = useState(ALL);
  const [roomId, setRoomId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [payment, setPayment] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [layout, setLayout] = useState<"table" | "cards">("table");

  const rooms = villas.find((v) => v.id === villaId)?.rooms ?? [];

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return views.filter(({ booking, customer, villa }) => {
      if (villaId !== ALL && booking.villaId !== villaId) return false;
      if (roomId !== ALL && !booking.roomIds.includes(roomId)) return false;
      if (status !== ALL && booking.status !== status) return false;
      if (payment !== ALL && booking.paymentStatus !== payment) return false;
      if (source !== ALL && booking.source !== source) return false;
      // Overlap, not containment — a stay spanning the window still matches.
      if (from && booking.checkOut <= from) return false;
      if (to && booking.checkIn >= to) return false;
      if (!needle) return true;
      return [
        customer?.name,
        customer?.phone,
        customer?.email,
        booking.reference,
        villa?.name,
      ]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle));
    });
  }, [views, search, villaId, roomId, status, payment, source, from, to]);

  const activeFilters =
    (villaId !== ALL ? 1 : 0) +
    (roomId !== ALL ? 1 : 0) +
    (status !== ALL ? 1 : 0) +
    (payment !== ALL ? 1 : 0) +
    (source !== ALL ? 1 : 0) +
    (from ? 1 : 0) +
    (to ? 1 : 0);

  const clearAll = () => {
    setSearch("");
    setVillaId(ALL);
    setRoomId(ALL);
    setStatus(ALL);
    setPayment(ALL);
    setSource(ALL);
    setFrom("");
    setTo("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${views.length} bookings on record`}
        title="Bookings"
        description="Every stay across the three villas, whole-villa and split-room alike."
        actions={
          <>
            <div className="hidden rounded-lg bg-white p-0.5 ring-1 ring-gold/20 sm:flex">
              <Button
                variant={layout === "table" ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => setLayout("table")}
                aria-label="Table view"
                aria-pressed={layout === "table"}
              >
                <Rows3 aria-hidden />
              </Button>
              <Button
                variant={layout === "cards" ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => setLayout("cards")}
                aria-label="Card view"
                aria-pressed={layout === "cards"}
              >
                <LayoutGrid aria-hidden />
              </Button>
            </div>
            <Button asChild size="sm">
              <Link to="/admin/bookings/new">
                <Plus aria-hidden />
                New booking
              </Link>
            </Button>
          </>
        }
      />

      {/* -------------------------------------------------------- filter bar */}
      <section
        aria-label="Filter bookings"
        className="rounded-xl bg-white p-4 shadow-soft ring-1 ring-gold/12"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="booking-search">Search</Label>
            <div className="relative">
              <Search
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone"
                aria-hidden
              />
              <Input
                id="booking-search"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Guest name, reference, phone or email"
              />
            </div>
          </div>

          <FilterSelect
            id="filter-villa"
            label="Villa"
            value={villaId}
            onChange={(value) => {
              setVillaId(value);
              setRoomId(ALL);
            }}
            options={[
              { value: ALL, label: "All villas" },
              ...villas.map((v) => ({ value: v.id, label: v.name })),
            ]}
          />
          <FilterSelect
            id="filter-room"
            label="Room"
            value={roomId}
            onChange={setRoomId}
            disabled={villaId === ALL}
            options={[
              { value: ALL, label: villaId === ALL ? "Pick a villa first" : "All rooms" },
              ...rooms.map((r) => ({ value: r.id, label: r.name })),
            ]}
          />
          <FilterSelect
            id="filter-status"
            label="Booking status"
            value={status}
            onChange={setStatus}
            options={[
              { value: ALL, label: "Any status" },
              ...bookingStatus.all.map((s) => ({ value: s.value, label: s.label })),
            ]}
          />
        </div>

        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end">
          <FilterSelect
            id="filter-payment"
            label="Payment"
            value={payment}
            onChange={setPayment}
            options={[
              { value: ALL, label: "Any payment state" },
              ...paymentStatus.all.map((s) => ({ value: s.value, label: s.label })),
            ]}
          />
          <FilterSelect
            id="filter-source"
            label="Source"
            value={source}
            onChange={setSource}
            options={[
              { value: ALL, label: "Any source" },
              ...sourceOptions.map(([value, label]) => ({ value, label })),
            ]}
          />
          <div className="space-y-1.5">
            <Label htmlFor="filter-from">Staying after</Label>
            <Input
              id="filter-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filter-to">Staying before</Label>
            <Input
              id="filter-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 lg:ml-auto lg:pb-0.5">
            <p className="text-sm text-stone-600">
              <SlidersHorizontal className="mr-1.5 inline size-3.5" aria-hidden />
              {filtered.length} of {views.length}
            </p>
            {(activeFilters > 0 || search) && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <X aria-hidden />
                Clear
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ results */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No bookings match those filters"
          description="Try widening the dates, or clear the villa filter to see everything again."
          action={
            <Button variant="outline" className="mt-2" onClick={clearAll}>
              Clear filters
            </Button>
          }
        />
      ) : layout === "cards" ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((view) => (
            <BookingCard key={view.booking.id} view={view} />
          ))}
        </ul>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl bg-white shadow-soft ring-1 ring-gold/12 lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Villa / rooms</TableHead>
                  <TableHead>Stay</TableHead>
                  <TableHead className="text-center">Guests</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(({ booking, villa, customer, roomNames, totals }) => {
                  const status = bookingStatus.get(booking.status);
                  const pay = paymentStatus.get(booking.paymentStatus);
                  const nights = nightsBetween(booking.checkIn, booking.checkOut);
                  return (
                    <TableRow key={booking.id} className="group">
                      <TableCell>
                        <Link
                          to={`/admin/bookings/${booking.id}`}
                          className="font-medium text-ink underline-offset-4 group-hover:text-clay group-hover:underline"
                        >
                          {booking.reference}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="block text-ink">{customer?.name}</span>
                        <span className="block text-xs text-stone-600">{customer?.phone}</span>
                      </TableCell>
                      <TableCell>
                        <span className="block text-ink">{villa?.name}</span>
                        <span className="block text-xs text-stone-600">
                          {booking.bookingMode === "whole"
                            ? "Whole villa"
                            : roomNames.join(", ") || "Rooms"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="block text-ink">
                          {formatShortDate(booking.checkIn)} – {formatShortDate(booking.checkOut)}
                        </span>
                        <span className="block text-xs text-stone-600">
                          {nights} {nights === 1 ? "night" : "nights"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {booking.adults + booking.children}
                      </TableCell>
                      <TableCell className="text-stone-600">
                        {bookingSource[booking.source]}
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={status.label} tone={status.tone} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={pay.label} tone={pay.tone} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(totals.total)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          totals.balance > 0 ? "text-clay" : "text-stone-600",
                        )}
                      >
                        {totals.balance > 0 ? money(totals.balance) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Below the table breakpoint, rows become cards rather than scrolling away */}
          <ul className="grid gap-4 sm:grid-cols-2 lg:hidden">
            {filtered.map((view) => (
              <BookingCard key={view.booking.id} view={view} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- fragments */

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5 lg:w-44">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function BookingCard({ view }: { view: BookingView }) {
  const { booking, villa, customer, roomNames, totals } = view;
  const status = bookingStatus.get(booking.status);
  const pay = paymentStatus.get(booking.paymentStatus);

  return (
    <li>
      <Link
        to={`/admin/bookings/${booking.id}`}
        className="group block overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-gold/12 transition-all hover:shadow-lift hover:ring-gold/35"
      >
        <div className="relative h-28 overflow-hidden">
          <img
            src={villa?.image}
            alt=""
            aria-hidden
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
          <div className="absolute inset-x-3 bottom-2 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-display text-lg text-white">{customer?.name}</p>
              <p className="truncate text-xs text-sand/75">
                {villa?.name}
                {booking.bookingMode === "split" && roomNames.length > 0
                  ? ` · ${roomNames.join(", ")}`
                  : " · Whole villa"}
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-ink/70 px-1.5 py-0.5 font-mono text-[0.6875rem] text-gold-200 backdrop-blur-sm">
              {booking.reference}
            </span>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge label={status.label} tone={status.tone} />
            <StatusBadge label={pay.label} tone={pay.tone} />
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="label-caps">Stay</dt>
              <dd className="mt-0.5 text-ink">
                {formatDateRange(booking.checkIn, booking.checkOut)}
              </dd>
            </div>
            <div>
              <dt className="label-caps">Guests</dt>
              <dd className="mt-0.5 text-ink">
                {booking.adults} adults
                {booking.children > 0 && ` · ${booking.children} children`}
              </dd>
            </div>
          </dl>
          <hr className="rule-gold" />
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-stone-600">{bookingSource[booking.source]}</span>
            <span className={cn("tabular-nums", totals.balance > 0 ? "text-clay" : "text-stone-600")}>
              {totals.balance > 0 ? `${money(totals.balance)} due` : "Settled"}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
