import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/common";
import { supabase } from "@/services/supabase/client";
import { useSettings } from "@/hooks/useData";
import { formatDate, money } from "@/lib/format";
import type { BookingView } from "@/hooks/useData";

/**
 * Send a guest their booking details, by whichever channel actually reaches
 * them.
 *
 * WhatsApp opens with the message prefilled and works immediately — it needs no
 * configuration and is how this property already talks to its guests. Email
 * goes through the `send-notification` function and needs an SMTP provider; if
 * one is not set up the button says so rather than pretending.
 */
export function SendBookingDetails({ view }: { view: BookingView }) {
  const { booking, villa, customer, totals } = view;
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const message =
    `Hello ${customer?.name ?? "there"}, here are your booking details.\n\n` +
    `Booking ${booking.reference}\n` +
    `${villa?.name}${booking.bookingMode === "whole" ? " (whole villa)" : ""}\n` +
    `${formatDate(booking.checkIn)} to ${formatDate(booking.checkOut)}\n` +
    `Check-in from ${villa?.checkInTime}, check-out by ${villa?.checkOutTime}\n` +
    `${booking.adults} adults${booking.children ? `, ${booking.children} children` : ""}\n\n` +
    `Total ${money(totals.total)}\n` +
    `Paid ${money(totals.paid)}\n` +
    `Balance ${money(totals.balance)}\n\n` +
    (totals.balance > 0
      ? `Pay by UPI to ${settings?.upiId ?? "the account on your invoice"} quoting ${booking.reference}, then upload the receipt in your guest portal.\n\n`
      : "") +
    `${settings?.tradingName ?? "Homes of Sanctuary"}, ${settings?.addressLine1 ?? "Nandi Hills"}`;

  const whatsappUrl = customer?.phone
    ? `https://wa.me/${customer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`
    : null;

  const sendEmail = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("send-notification", {
      body: { bookingId: booking.id, kind: "booking_confirmed", channels: ["email"] },
    });
    setBusy(false);

    if (error) return toast.error("Could not send", { description: error.message });

    const result = (data as { results?: { email?: { delivered: boolean; reason?: string } } })
      ?.results?.email;

    if (result?.delivered) {
      toast.success(`Emailed to ${customer?.email}`);
    } else {
      toast.warning("Email is not configured", {
        description:
          result?.reason === "no email provider configured"
            ? "Set SMTP_HOST, SMTP_USER and SMTP_PASS as function secrets (or run npm run configure-email for Resend) — or send it on WhatsApp, which needs none of that."
            : (result?.reason ?? "The provider rejected the message."),
      });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("Message copied");
    } catch {
      toast.error("Could not copy — select the text and copy it manually");
    }
  };

  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
      <Eyebrow className="text-gold-700">Send booking details</Eyebrow>
      <p className="mt-3 text-sm text-stone-600">
        Dates, totals and payment instructions for {customer?.name}.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {whatsappUrl ? (
          <Button asChild size="sm">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              <MessageCircle aria-hidden />
              WhatsApp
            </a>
          </Button>
        ) : (
          <Button size="sm" disabled title="No phone number on file">
            <MessageCircle aria-hidden />
            WhatsApp
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => void sendEmail()}
          disabled={busy || !customer?.email}
          title={customer?.email ? undefined : "No email address on file"}
        >
          <Mail aria-hidden />
          {busy ? "Sending…" : "Email"}
        </Button>

        <Button variant="ghost" size="sm" onClick={() => void copy()}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          Copy
        </Button>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-stone-600 hover:text-ink">
          Preview the message
        </summary>
        <pre className="mt-2 rounded-lg bg-sand-200/60 p-3 text-xs whitespace-pre-wrap text-ink">
          {message}
        </pre>
      </details>
    </section>
  );
}
