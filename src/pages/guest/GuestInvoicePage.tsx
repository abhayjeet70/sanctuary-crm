import { toast } from "sonner";
import { Download, Mail, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, Eyebrow } from "@/components/common";
import { InvoiceDocument } from "@/components/booking/InvoiceDocument";
import { useGuestStay } from "@/hooks/useGuest";

export default function GuestInvoicePage() {
  const { view, invoice, customer } = useGuestStay();

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
        <Button
          variant="outline"
          onClick={() => toast.info("PDF download arrives with the Supabase phase")}
        >
          <Download aria-hidden />
          Download PDF
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.info(`Would email a copy to ${customer?.email}`, {
              description: "Email delivery is not wired up in this phase.",
            })
          }
        >
          <Mail aria-hidden />
          Email me a copy
        </Button>
      </div>

      <InvoiceDocument view={view} invoice={invoice} className="rounded-2xl" />
    </div>
  );
}
