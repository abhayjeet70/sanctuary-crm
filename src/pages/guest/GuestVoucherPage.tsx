import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, Eyebrow } from "@/components/common";
import { VoucherDocument } from "@/components/booking/VoucherDocument";
import { useGuestStay } from "@/hooks/useGuest";

/**
 * The guest's own copy of the voucher.
 *
 * Available from the moment the booking exists, unlike the invoice, which is
 * finalised at check-out: this is the document somebody wants on their phone
 * on the drive up, not the one they file for tax.
 */
export default function GuestVoucherPage() {
  const { view } = useGuestStay();

  if (!view) return <ErrorState className="m-5" title="No stay found" />;

  return (
    <div className="space-y-5 p-5 sm:p-8">
      <header className="print:hidden">
        <Eyebrow className="text-gold-700">{view.booking.reference}</Eyebrow>
        <h1 className="display-caps mt-2 text-3xl text-ink sm:text-4xl">Your voucher</h1>
        <p className="mt-2 max-w-lg text-sm text-stone-600">
          Everything about your stay on one page. Save it, or show us the reference when
          you arrive.
        </p>
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
      </div>

      <VoucherDocument view={view} className="rounded-2xl" />
    </div>
  );
}
