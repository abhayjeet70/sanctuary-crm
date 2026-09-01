import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, Eyebrow } from "@/components/common";
import { InvoiceDocument } from "@/components/booking/InvoiceDocument";
import { EmailGuestButton } from "@/components/booking/GuestAccessPanel";
import { useGuestStay } from "@/hooks/useGuest";

export default function GuestInvoicePage() {
  const { view, invoice } = useGuestStay();

  if (!view) return <ErrorState className="m-5" title="No stay found" />;

  return (
    <div className="space-y-5 p-5 sm:p-8">
      <header className="print:hidden">
        <Eyebrow className="text-gold-700">
          {invoice?.number ?? "Draft — issued at check-out"}
        </Eyebrow>
        <h1 className="display-caps mt-2 text-3xl text-ink sm:text-4xl">Invoice</h1>
      </header>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button onClick={() => window.print()}>
          <Printer aria-hidden />
          Print
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Download aria-hidden />
          Save as PDF
        </Button>
        <EmailGuestButton
          bookingId={view.booking.id}
          kind="invoice_ready"
          label="Email me a copy"
        />
      </div>

      <InvoiceDocument view={view} invoice={invoice} className="rounded-2xl" />
    </div>
  );
}
