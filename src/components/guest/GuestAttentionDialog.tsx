import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Hourglass, PackageSearch, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMockData, useWaitlist } from "@/hooks/useData";
import { useGuestStay } from "@/hooks/useGuest";
import { money } from "@/lib/format";

const SEEN = "hos-guest-attention-seen";

/**
 * What needs the guest today, said once, loudly.
 *
 * Money owed, a receipt that was turned down, something found that may be
 * theirs, a place on the waiting list that has been offered — each is
 * something a guest loses out on by not noticing. So they are gathered into
 * one dialog on landing rather than left as small cards below the fold.
 *
 * Shown once per browser session: a dialog that returns on every visit to the
 * dashboard teaches people to dismiss it unread.
 */
export function GuestAttentionDialog() {
  const { view, isCompanion } = useGuestStay();
  const { guestLostItems } = useMockData();
  const waitlist = useWaitlist();

  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(SEEN) !== "1";
    } catch {
      return true;
    }
  });

  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(SEEN, "1");
    } catch {
      // Private mode: it simply shows again next visit.
    }
  };

  const items: {
    key: string;
    icon: React.ReactNode;
    title: string;
    body: string;
    to: string;
    cta: string;
  }[] = [];

  if (view && !isCompanion) {
    const { booking, totals } = view;
    const live = !["cancelled", "rejected", "no_show"].includes(booking.status);

    if (booking.paymentStatus === "rejected") {
      items.push({
        key: "rejected",
        icon: <AlertTriangle className="size-5" aria-hidden />,
        title: "Your receipt could not be accepted",
        body: "Please send a fresh receipt so we can confirm your stay.",
        to: "/guest/payment",
        cta: "Upload a new receipt",
      });
    } else if (live && totals.balance > 0) {
      items.push({
        key: "balance",
        icon: <Wallet className="size-5" aria-hidden />,
        title: `${money(totals.balance)} is waiting to be paid`,
        body:
          booking.paymentStatus === "uploaded"
            ? "Your receipt is with us and being checked."
            : "Pay by UPI or bank transfer and upload the receipt to confirm your booking.",
        to: "/guest/payment",
        cta: booking.paymentStatus === "uploaded" ? "See payment" : "Pay now",
      });
    }
  }

  for (const item of guestLostItems) {
    if (
      item.isMineToAnswer &&
      ["guest_contacted", "claim_rejected", "claim_verified"].includes(item.status)
    ) {
      items.push({
        key: `lf-${item.id}`,
        icon: <PackageSearch className="size-5" aria-hidden />,
        title: item.status === "claim_verified" ? "Your item is confirmed" : "We found something",
        body:
          item.status === "claim_verified"
            ? `${item.title} — tell us how you would like it back.`
            : `${item.title} may belong to you. Is it yours?`,
        to: "/guest/lost-found",
        cta: "Open Lost & Found",
      });
    }
  }

  for (const entry of waitlist) {
    if (entry.status === "offered") {
      items.push({
        key: `wl-${entry.id}`,
        icon: <Hourglass className="size-5" aria-hidden />,
        title: "Your dates are available",
        body: "A house you were waiting for has come free. Get in touch to hold it.",
        to: "/guest/waitlist",
        cta: "See your waiting list",
      });
    }
  }

  if (items.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {items.length === 1 ? "One thing needs you" : `${items.length} things need you`}
          </DialogTitle>
          <DialogDescription>Before you carry on.</DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.key} className="rounded-xl bg-sand-200/70 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-clay-600">{item.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{item.title}</p>
                  <p className="mt-0.5 text-sm text-stone-600">{item.body}</p>
                  <Button asChild size="sm" className="mt-3" onClick={close}>
                    <Link to={item.to}>
                      {item.cta}
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <Button variant="ghost" onClick={close}>
          Not now
        </Button>
      </DialogContent>
    </Dialog>
  );
}
