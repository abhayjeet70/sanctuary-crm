import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/common";
import { CustomerDialog } from "@/components/admin/CustomerDialog";
import { useShowsFinancials } from "@/services/session";
import { useBookingViews, useCustomers } from "@/hooks/useData";
import { formatDate, initials, money } from "@/lib/format";
import { cn } from "@/lib/utils";
export default function CustomersListPage() {
  const customers = useCustomers();
  const views = useBookingViews();
  const showsFinancials = useShowsFinancials();
  const [search, setSearch] = useState("");
  // ?add=1 is how the dashboard's "Add customer" quick action lands here.
  const [params, setParams] = useSearchParams();
  const adding = params.get("add") === "1";
  const setAdding = (open: boolean) => setParams(open ? { add: "1" } : {}, { replace: true });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return customers
      .map((customer) => {
        const own = views.filter((v) => v.booking.customerId === customer.id);
        const counted = own.filter(
          (v) => v.booking.status !== "cancelled" && v.booking.status !== "rejected",
        );
        const past = own
          .filter(
            (v) => v.booking.status === "completed" || v.booking.status === "checked_out",
          )
          .sort((a, b) => b.booking.checkOut.localeCompare(a.booking.checkOut));
        return {
          customer,
          bookingCount: own.length,
          spend: counted.reduce((sum, v) => sum + v.totals.total, 0),
          lastStay: past[0]?.booking.checkOut,
        };
      })
      .filter(({ customer }) =>
        needle
          ? [customer.name, customer.phone, customer.email, customer.city]
              .join(" ")
              .toLowerCase()
              .includes(needle)
          : true,
      )
      // Ranking guests by spend is a sales report in itself, so for anyone
      // without the financials it orders by who stayed most recently.
      .sort((a, b) =>
        showsFinancials
          ? b.spend - a.spend
          : (b.lastStay ?? "").localeCompare(a.lastStay ?? "") ||
            a.customer.name.localeCompare(b.customer.name),
      );
  }, [customers, views, search, showsFinancials]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${customers.length} guests on record`}
        title="Guests"
        description="Everyone who has stayed or is due to, with their history and what they prefer."
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus aria-hidden />
            Add guest
          </Button>
        }
      />

      {adding && <CustomerDialog customer={null} onClose={() => setAdding(false)} />}

      <div className="rounded-xl bg-white p-4 shadow-soft ring-1 ring-ink/[0.06]">
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="guest-search">Search</Label>
          <div className="relative">
            <Search
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone"
              aria-hidden
            />
            <Input
              id="guest-search"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, phone, email or city"
            />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No guests match that search"
          description="Try a phone number or just the first few letters of a name."
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06] md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-center">Bookings</TableHead>
                  <TableHead>Last stay</TableHead>
                  {showsFinancials && (
                    <TableHead className="text-right">Lifetime spend</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ customer, bookingCount, spend, lastStay }) => {
                  return (
                    <TableRow key={customer.id} className="group">
                      <TableCell>
                        <span className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-semibold text-gold-700">
                            {initials(customer.name)}
                          </span>
                          <Link
                            to={`/admin/customers/${customer.id}`}
                            className="font-medium text-ink underline-offset-4 group-hover:text-clay-600 group-hover:underline"
                          >
                            {customer.name}
                          </Link>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="block text-ink">{customer.phone}</span>
                        <span className="block text-xs text-stone-600">{customer.email}</span>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{bookingCount}</TableCell>
                      <TableCell className="text-stone-600">
                        {lastStay ? formatDate(lastStay) : "Not yet stayed"}
                      </TableCell>
                      {showsFinancials && (
                        <TableCell className="text-right tabular-nums">{money(spend)}</TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2 md:hidden">
            {rows.map(({ customer, bookingCount, spend, lastStay }) => (
              <li key={customer.id}>
                <Link
                  to={`/admin/customers/${customer.id}`}
                  className="block rounded-xl bg-white p-4 shadow-soft ring-1 ring-ink/[0.06] transition-all hover:ring-gold/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-sm font-semibold text-gold-700">
                      {initials(customer.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{customer.name}</p>
                      <p className="truncate text-xs text-stone-600">{customer.phone}</p>
                    </div>
                  </div>
                  <hr className="rule-gold my-3" />
                  <dl
                    className={cn(
                      "grid gap-2 text-center text-xs",
                      showsFinancials ? "grid-cols-3" : "grid-cols-2",
                    )}
                  >
                    <div>
                      <dt className="label-caps">Stays</dt>
                      <dd className="mt-0.5 text-ink tabular-nums">{bookingCount}</dd>
                    </div>
                    {showsFinancials && (
                      <div>
                        <dt className="label-caps">Spend</dt>
                        <dd className="mt-0.5 text-ink tabular-nums">{money(spend)}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="label-caps">Last</dt>
                      <dd className="mt-0.5 text-ink">
                        {lastStay ? formatDate(lastStay).split(",")[1] : "—"}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
