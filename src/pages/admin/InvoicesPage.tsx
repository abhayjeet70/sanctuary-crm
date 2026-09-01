import { Link } from "react-router-dom";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/common";
import { SendInvoice } from "@/components/booking/SendInvoice";
import { useBookingViews, useInvoices } from "@/hooks/useData";
import { titleCase } from "@/lib/status";
import { formatDate, money } from "@/lib/format";

export default function InvoicesPage() {
  const invoices = useInvoices();
  const views = useBookingViews();

  const rows = invoices
    .map((invoice) => ({
      invoice,
      view: views.find((v) => v.booking.id === invoice.bookingId),
    }))
    .filter((row) => row.view)
    .sort((a, b) => b.invoice.issuedAt.localeCompare(a.invoice.issuedAt));

  const billed = rows.reduce((sum, r) => sum + (r.view?.totals.total ?? 0), 0);
  const outstanding = rows.reduce((sum, r) => sum + (r.view?.totals.balance ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${invoices.length} raised`}
        title="Invoices"
        description="Every invoice against a booking. Issue it to the guest portal, or send it on WhatsApp or email."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Invoices" value={rows.length} icon={<Receipt className="size-4" />} />
        <StatCard label="Total billed" value={money(billed)} tone="accent" />
        <StatCard
          label="Still outstanding"
          value={money(outstanding)}
          tone={outstanding > 0 ? "warn" : "default"}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Receipt className="size-5" />} title="No invoices raised yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-soft ring-1 ring-gold/12">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Villa</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ invoice, view }) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono text-xs">{invoice.number}</TableCell>
                  <TableCell>{view?.customer?.name}</TableCell>
                  <TableCell className="text-stone-600">{view?.villa?.name}</TableCell>
                  <TableCell className="text-stone-600">{formatDate(invoice.issuedAt)}</TableCell>
                  <TableCell>
                    <StatusBadge
                      label={titleCase(invoice.status)}
                      tone={
                        invoice.status === "paid"
                          ? "confirmed"
                          : invoice.status === "draft"
                            ? "pending"
                            : "uploaded"
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(view?.totals.total ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {view && view.totals.balance > 0 ? money(view.totals.balance) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <SendInvoice view={view!} invoice={invoice} />
                      <Button asChild variant="link" size="sm">
                        <Link to={`/admin/bookings/${invoice.bookingId}`}>Open</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
