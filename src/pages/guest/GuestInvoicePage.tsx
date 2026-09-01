import { Download, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Eyebrow } from "@/components/common";
import { InvoiceDocument } from "@/components/booking/InvoiceDocument";
import { EmailGuestButton } from "@/components/booking/GuestAccessPanel";
import { useGuestStay } from "@/hooks/useGuest";

export default function GuestInvoicePage() {
  const { view, invoice } = useGuestStay();

  if (!view) return <ErrorState className="m-5" title="No stay found" />;

  // Drafts stay with the property until they are issued — the policy hides
  // them too, so this is what a guest sees rather than an empty document.
  if (!invoice || invoice.status === "draft") {
    return (
      <div className="p-5 sm:p-8">
        <EmptyState
          icon={<FileText className="size-5" />}
          title="Your invoice is not ready yet"
          description="We finalise it at check-out, once any dining and extras are on the bill. You will be sent a copy, and it will appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-5 sm:p-8">
      <header className="print:hidden">
        <Eyebrow className="text-gold-700">
          {invoice.number}
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
