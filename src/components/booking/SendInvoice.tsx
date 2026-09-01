import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Copy,
  ExternalLink,
  FileCheck2,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/services/supabase/client";
import { useMockData, useSettings, type BookingView } from "@/hooks/useData";
import { formatDate, money } from "@/lib/format";
import type { Invoice } from "@/types";

/**
 * Issue an invoice and get it to the guest.
 *
 * Issuing is what publishes it: a draft is the property's working copy and the
 * guest portal does not show one. The channels differ in what they can carry —
 * WhatsApp and email send a summary and a link to the portal, because the
 * document itself is printed from the portal rather than attached.
 */
export function SendInvoice({ view, invoice }: { view: BookingView; invoice: Invoice }) {
  const { booking, villa, customer, totals } = view;
  const { setInvoiceStatus } = useMockData();
  const settings = useSettings();
  const [busy, setBusy] = useState(false);

  const isDraft = invoice.status === "draft";
  // Guarded because the offline smoke harness renders this on the server.
  const portalUrl =
    typeof window === "undefined" ? "/guest/invoice" : `${window.location.origin}/guest/invoice`;

  const message =
    `Dear ${customer?.name ?? "guest"},\n\n` +
    `Invoice ${invoice.number} for your stay at ${villa?.name ?? "Homes of Sanctuary"} ` +
    `(${formatDate(booking.checkIn)} to ${formatDate(booking.checkOut)}) is ready.\n\n` +
    `Total ${money(totals.total)}\n` +
    `Received ${money(totals.paid)}\n` +
    `Balance ${money(totals.balance)}\n\n` +
    (totals.balance > 0 && settings?.upiId
      ? `Pay by UPI to ${settings.upiId} quoting ${booking.reference}, then upload the receipt in your portal.\n\n`
      : "") +
    `View and print it here: ${portalUrl}\n\n` +
    `${settings?.tradingName ?? "Homes of Sanctuary"}, ${settings?.addressLine1 ?? "Nandi Hills"}`;

  const whatsappUrl = customer?.phone
    ? `https://wa.me/${customer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`
    : null;

  /** Issuing before sending, so the guest is never sent a link to nothing. */
  const issue = () => {
    setInvoiceStatus(invoice.id, "issued");
    toast.success(`${invoice.number} issued`, {
      description: "It is now visible in the guest portal.",
    });
  };

  const emailIt = async () => {
    if (isDraft) setInvoiceStatus(invoice.id, "issued");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("send-notification", {
      body: { bookingId: booking.id, kind: "invoice_ready", channels: ["email"] },
    });
    setBusy(false);

    if (error) return toast.error("Could not send", { description: error.message });

    const result = (data as { results?: { email?: { delivered: boolean; reason?: string } } })
      ?.results?.email;

    if (result?.delivered) {
      toast.success(`${invoice.number} emailed to ${customer?.email}`);
    } else {
      toast.warning("Email is not configured", {
        description:
          result?.reason === "no email provider configured"
            ? "Run: npm run configure-email — or send it on WhatsApp, which needs no setup."
            : (result?.reason ?? "The provider rejected the message."),
      });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Invoice message copied");
    } catch {
      toast.error("Could not copy — select the text and copy it manually");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          <Send aria-hidden />
          {busy ? "Sending…" : "Send"}
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>{invoice.number}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={issue} disabled={!isDraft}>
          <FileCheck2 aria-hidden />
          {isDraft ? "Issue to the portal" : "Already in the portal"}
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={() => void emailIt()}
          disabled={!customer?.email}
        >
          <Mail aria-hidden />
          {customer?.email ? "Email the invoice" : "No email on file"}
        </DropdownMenuItem>

        {whatsappUrl ? (
          <DropdownMenuItem asChild>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => isDraft && setInvoiceStatus(invoice.id, "issued")}
            >
              <MessageCircle aria-hidden />
              Send on WhatsApp
            </a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <MessageCircle aria-hidden />
            No phone on file
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onSelect={() => void copy()}>
          <Copy aria-hidden />
          Copy the message
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={`/admin/bookings/${booking.id}`}>
            <ExternalLink aria-hidden />
            Open the booking
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
