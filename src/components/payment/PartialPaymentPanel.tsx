import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Eyebrow, StatusBadge } from "@/components/common";
import type { PartialPaymentRequest } from "@/hooks/usePartialPayments";
import { addDays, toISODate } from "@/services/domain";
import { formatDate, money } from "@/lib/format";

/**
 * The guest's side of a part-payment: ask, see the answer, see what is due when.
 * Asking also opens WhatsApp to the desk with the same details, so a person
 * sees it straight away rather than waiting for someone to check the queue.
 */
export function PartialPaymentPanel({
  reference,
  balance,
  whatsappNumber,
  pending,
  approved,
  latest,
  onRequest,
}: {
  reference: string;
  balance: number;
  whatsappNumber: string;
  pending?: PartialPaymentRequest;
  approved?: PartialPaymentRequest;
  latest?: PartialPaymentRequest;
  onRequest: (amountNow: number, nextDue: string, note: string) => Promise<{ error: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Math.round(balance / 2)));
  const [nextDue, setNextDue] = useState(addDays(toISODate(new Date()), 7));
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const amountNow = Number(amount);
  const invalid =
    !amountNow || amountNow <= 0
      ? "Enter how much you can pay now."
      : amountNow >= balance
        ? "That is the whole balance — no request needed."
        : !nextDue || nextDue < toISODate(new Date())
          ? "Choose a date for the rest."
          : null;

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (invalid) return toast.error(invalid);
    // Open the tab now, while we still have the click: browsers block a
    // window.open that comes after an await as an unwanted popup.
    const chat = whatsappNumber ? window.open("", "_blank") : null;
    setSending(true);
    const { error } = await onRequest(amountNow, nextDue, note.trim());
    setSending(false);
    if (error) {
      chat?.close();
      return toast.error("Could not send the request", { description: error });
    }
    toast.success("Request sent — we will reply shortly");
    setOpen(false);
    if (chat) {
      chat.opener = null;
      const message = [
        `Hello, I have requested a part-payment for booking ${reference}.`,
        `Pay now: ${money(amountNow)}`,
        `Remaining ${money(balance - amountNow)} by ${formatDate(nextDue)}`,
        note.trim() && `Note: ${note.trim()}`,
      ]
        .filter(Boolean)
        .join("\n");
      chat.location.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    }
  };

  if (approved) {
    return (
      <section className="rounded-2xl bg-status-confirmed-bg p-5 ring-1 ring-status-confirmed/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow className="text-ink">Part-payment approved</Eyebrow>
          <StatusBadge label="Approved" tone="confirmed" />
        </div>
        <p className="mt-2 text-sm text-ink">
          Pay <strong className="tabular-nums">{money(approved.amountNow)}</strong> now. The rest
          is due by <strong>{formatDate(approved.nextDueDate)}</strong>.
        </p>
      </section>
    );
  }

  if (pending) {
    return (
      <section className="rounded-2xl bg-status-pending-bg p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow className="text-ink">Part-payment requested</Eyebrow>
          <StatusBadge label="Waiting for reply" tone="pending" />
        </div>
        <p className="mt-2 text-sm text-ink">
          {money(pending.amountNow)} now, the rest by {formatDate(pending.nextDueDate)}. Until we
          reply, the full balance applies.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.07]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow className="text-gold-700">We take the full amount in advance</Eyebrow>
          <p className="mt-1 text-sm text-stone-600">
            Need to pay in parts? Ask us — once approved you can pay part now and the rest later.
            {latest?.status === "rejected" && " Your last request was declined."}
          </p>
        </div>
        {!open && (
          <Button variant="outline" onClick={() => setOpen(true)}>
            <CalendarClock aria-hidden />
            Request part-payment
          </Button>
        )}
      </div>

      {open && (
        <form onSubmit={(e) => void send(e)} noValidate className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pp-amount">I can pay now (₹)</Label>
            <Input id="pp-amount" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-xs text-stone-600">
              Remaining {money(Math.max(0, balance - (amountNow || 0)))}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-date">I will pay the rest by</Label>
            <Input
              id="pp-date"
              type="date"
              min={toISODate(new Date())}
              value={nextDue}
              onChange={(e) => setNextDue(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pp-note">Anything we should know (optional)</Label>
            <Textarea id="pp-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {invalid && (
            <p role="alert" className="text-xs text-status-cancelled sm:col-span-2">
              {invalid}
            </p>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={sending || Boolean(invalid)}>
              {sending ? <Loader2 className="animate-spin" aria-hidden /> : <MessageCircle aria-hidden />}
              Send request{whatsappNumber && " & chat on WhatsApp"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
