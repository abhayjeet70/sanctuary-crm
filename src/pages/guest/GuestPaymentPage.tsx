import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Building, Smartphone, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ErrorState, Eyebrow, StatusBadge } from "@/components/common";
import { FinancialBreakdown } from "@/components/booking/FinancialBreakdown";
import { useGuestStay } from "@/hooks/useGuest";
import { useMockData, useSettings } from "@/hooks/useData";
import { paymentStatus, titleCase } from "@/lib/status";
import { formatDateTime, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Payment, PaymentMethod } from "@/types";
import {
  ACCEPTED_RECEIPT_TYPES,
  MAX_RECEIPT_BYTES,
  uploadReceipt,
} from "@/services/supabase/receipts";

const MAX_MB = MAX_RECEIPT_BYTES / (1024 * 1024);
const ACCEPTED = ACCEPTED_RECEIPT_TYPES;

export default function GuestPaymentPage() {
  const { view, payments } = useGuestStay();
  const { addPayment } = useMockData();
  const settings = useSettings();

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  // Derived during render; the effect exists only to release the previous URL,
  // which is a real resource rather than a piece of state.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  if (!view) {
    return <ErrorState className="m-5" title="No stay found" />;
  }

  const { booking, totals } = view;
  const pay = paymentStatus.get(booking.paymentStatus);

  const errors = {
    file: !file ? "Attach the receipt from your bank or UPI app." : undefined,
    amount:
      !amount || Number(amount) <= 0
        ? "Enter the amount you transferred."
        : undefined,
    reference:
      method === "bank_transfer" && !reference.trim()
        ? "A bank transfer needs its UTR — it is how we match your payment to the statement."
        : reference.trim() && reference.trim().length < 6
          ? "That looks too short for a transaction reference."
          : undefined,
  };
  const blocked = Object.values(errors).some(Boolean);

  const pickFile = (chosen: File | undefined) => {
    if (!chosen) return;
    if (!ACCEPTED.includes(chosen.type)) {
      toast.error("That file type is not supported", {
        description: "Send a JPG, PNG, WebP or PDF.",
      });
      return;
    }
    if (chosen.size > MAX_MB * 1024 * 1024) {
      toast.error(`That file is larger than ${MAX_MB} MB`, {
        description: "A screenshot from your phone is usually well under this.",
      });
      return;
    }
    setFile(chosen);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);

    if (blocked || !file) {
      const missing = Object.values(errors).filter(Boolean);
      toast.error(
        missing.length === 1 ? "One thing is missing" : `${missing.length} things are missing`,
        { description: missing.join(" ") },
      );
      return;
    }

    setSending(true);

    // The file goes to the private bucket first. If that fails there is no
    // point writing a payment row that points at nothing.
    const { path, error: uploadError } = await uploadReceipt(booking.id, file);
    if (uploadError || !path) {
      setSending(false);
      toast.error("Could not upload the receipt", {
        description: uploadError ?? "Please try again.",
      });
      return;
    }

    const payment: Payment = {
      id: `p-${Date.now()}`,
      bookingId: booking.id,
      amount: Number(amount),
      method,
      reference: reference.trim(),
      // A storage path, not a URL. The admin viewer signs it on demand.
      receiptImage: path,
      status: "uploaded",
      createdAt: new Date().toISOString(),
    };

    addPayment(payment);
    setSending(false);
    setFile(null);
    setAmount("");
    setReference("");
    setSubmitted(false);
    toast.success("Receipt submitted", {
      description: "We will confirm it and update your booking, usually the same day.",
    });
  };

  return (
    <div className="space-y-6 p-5 sm:p-8">
      <header>
        <Eyebrow className="text-gold-700">Payment</Eyebrow>
        <h1 className="display-caps mt-2 text-3xl text-ink sm:text-4xl">
          {totals.balance > 0 ? "Settle your stay" : "Fully settled"}
        </h1>
      </header>

      {/* -------------------------------------------------------- the figure */}
      <section className="rounded-2xl bg-ink p-6 text-sand shadow-lift ring-1 ring-gold/30">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow className="text-gold-400">Balance due</Eyebrow>
            <p className="text-gold-gradient mt-2 font-display text-4xl tabular-nums">
              {totals.balance > 0 ? money(totals.balance) : "Settled"}
            </p>
          </div>
          <StatusBadge label={pay.label} tone={pay.tone} />
        </div>
        <hr className="rule-gold my-5" />
        <FinancialBreakdown charges={booking.charges} totals={totals} tone="dark" />
      </section>

      {totals.balance > 0 && (
        <>
          {/* ------------------------------------------------- instructions */}
          <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-gold/15">
            <Eyebrow className="text-gold-700">How to pay</Eyebrow>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-sand-200/60 p-4">
                <p className="flex items-center gap-2 font-medium text-ink">
                  <Smartphone className="size-4 text-gold-700" aria-hidden />
                  UPI
                </p>
                <p className="mt-2 font-mono text-sm text-ink">
                  {settings?.upiId || "Not set up yet"}
                </p>
                <p className="mt-1 text-xs text-stone-600">
                  Quote {booking.reference} in the note.
                </p>
              </div>
              <div className="rounded-xl bg-sand-200/60 p-4">
                <p className="flex items-center gap-2 font-medium text-ink">
                  <Building className="size-4 text-gold-700" aria-hidden />
                  Bank transfer
                </p>
                <dl className="mt-2 space-y-0.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-stone-600">A/C</dt>
                    <dd className="font-mono text-ink">
                      {settings?.accountNumber || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-stone-600">IFSC</dt>
                    <dd className="font-mono text-ink">{settings?.ifsc || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-stone-600">Name</dt>
                    <dd className="text-ink">{settings?.accountName || "—"}</dd>
                  </div>
                  {settings?.bankName && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-stone-600">Bank</dt>
                      <dd className="text-ink">{settings.bankName}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            <p className="mt-5 rounded-xl bg-status-uploaded-bg p-4 text-sm leading-relaxed text-ink">
              {settings?.paymentNote ||
                "Transfer the amount using either method above, then upload your receipt below."}{" "}
              We check it by hand and confirm your booking, usually the same day.
            </p>
          </section>

          {/* ------------------------------------------------------- upload */}
          <form
            onSubmit={(event) => void submit(event)}
            noValidate
            className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-gold/15"
          >
            <Eyebrow className="text-gold-700">Upload your receipt</Eyebrow>
            <p className="mt-2 text-sm text-stone-600">
              Send us the screenshot or PDF and we will match it against your booking.
            </p>

            <div className="mt-5 space-y-5">
              {/* Drop zone */}
              <div>
                <input
                  ref={fileInput}
                  id="receipt"
                  type="file"
                  accept={ACCEPTED.join(",")}
                  className="sr-only"
                  onChange={(event) => pickFile(event.target.files?.[0])}
                />
                {file ? (
                  <div className="flex flex-wrap items-center gap-4 rounded-xl bg-sand-200/60 p-4">
                    {preview && file.type !== "application/pdf" && (
                      <img
                        src={preview}
                        alt="Preview of the receipt you selected"
                        className="size-24 rounded-lg object-cover ring-1 ring-gold/25"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{file.name}</p>
                      <p className="text-xs text-stone-600">
                        {(file.size / 1024).toFixed(0)} KB · {file.type.split("/")[1]}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFile(null);
                        if (fileInput.current) fileInput.current.value = "";
                      }}
                    >
                      <X aria-hidden />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label
                    htmlFor="receipt"
                    className={cn(
                      "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
                      submitted && errors.file
                        ? "border-status-cancelled/50 bg-status-cancelled-bg"
                        : "border-gold/35 bg-sand-200/40 hover:border-gold/70 hover:bg-gold/8",
                    )}
                  >
                    <span className="flex size-11 items-center justify-center rounded-full bg-gold/15 text-gold-700">
                      <Upload className="size-5" aria-hidden />
                    </span>
                    <span className="font-medium text-ink">Choose a file</span>
                    <span className="text-xs text-stone-600">
                      JPG, PNG, WebP or PDF · up to {MAX_MB} MB
                    </span>
                  </label>
                )}
                {submitted && errors.file && (
                  <p role="alert" className="mt-2 text-xs text-status-cancelled">
                    {errors.file}
                  </p>
                )}
              </div>

              {/* Method */}
              <fieldset>
                <legend className="label-caps mb-2">How did you pay?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["upi", "UPI", Smartphone],
                      ["bank_transfer", "Bank transfer", Building],
                    ] as const
                  ).map(([value, label, Icon]) => (
                    <label
                      key={value}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl p-4 transition-colors",
                        method === value
                          ? "bg-gold/12 ring-2 ring-gold"
                          : "bg-sand-200/60 hover:bg-sand-300/60",
                      )}
                    >
                      <input
                        type="radio"
                        name="method"
                        value={value}
                        checked={method === value}
                        onChange={() => setMethod(value)}
                        className="size-4 accent-[var(--color-clay)]"
                      />
                      <Icon className="size-4 text-gold-700" aria-hidden />
                      <span className="font-medium text-ink">{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="amount">
                    Amount transferred{" "}
                    <span className="font-normal text-clay">required</span>
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    inputMode="decimal"
                    min={1}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="Amount in rupees"
                    aria-invalid={submitted && Boolean(errors.amount)}
                    aria-describedby="amount-error"
                  />
                  {submitted && errors.amount ? (
                    <p id="amount-error" role="alert" className="text-xs text-status-cancelled">
                      {errors.amount}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAmount(String(totals.balance))}
                      className="text-xs text-clay underline underline-offset-4"
                    >
                      Use the full balance, {money(totals.balance)}
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reference">
                    Transaction / UTR number{" "}
                    {method === "bank_transfer" ? (
                      <span className="font-normal text-clay">required</span>
                    ) : (
                      <span className="font-normal text-stone-600">optional</span>
                    )}
                  </Label>
                  <Input
                    id="reference"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder={
                      method === "upi"
                        ? "If your UPI app shows one"
                        : "Paste the UTR from your bank"
                    }
                    aria-invalid={submitted && Boolean(errors.reference)}
                    aria-describedby="reference-error"
                  />
                  {submitted && errors.reference ? (
                    <p id="reference-error" role="alert" className="text-xs text-status-cancelled">
                      {errors.reference}
                    </p>
                  ) : (
                    method === "upi" && (
                      <p className="text-xs text-stone-600">
                        Not on your screenshot? Leave it — we will match the payment from
                        the receipt and the amount.
                      </p>
                    )
                  )}
                </div>
              </div>

              <Button type="submit" className="w-full sm:w-auto" disabled={sending}>
                {sending ? "Uploading…" : "Submit receipt"}
              </Button>
            </div>
          </form>
        </>
      )}

      {/* ------------------------------------------------------------ history */}
      <section>
        <Eyebrow className="mb-3 text-gold-700">Payment history</Eyebrow>
        {payments.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            description="Payments appear here once we have received them."
          />
        ) : (
          <ul className="space-y-3">
            {payments.map((payment) => {
              const state = paymentStatus.get(payment.status);
              return (
                <li
                  key={payment.id}
                  className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-gold/12"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-xl tabular-nums text-ink">
                        {money(payment.amount)}
                      </p>
                      <p className="mt-1 text-sm text-stone-600">
                        {payment.method === "upi" ? "UPI" : "Bank transfer"}
                        {payment.reference && (
                          <>
                            {" · "}
                            <span className="font-mono">{payment.reference}</span>
                          </>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-stone">
                        {formatDateTime(payment.createdAt)}
                      </p>
                    </div>
                    <StatusBadge label={state.label} tone={state.tone} />
                  </div>

                  {payment.status === "rejected" && (
                    <div className="mt-3 rounded-lg bg-status-cancelled-bg p-3 text-sm">
                      <p className="font-medium text-ink">
                        We could not accept this — {titleCase(payment.rejectionReason ?? "other")}
                      </p>
                      {payment.rejectionNote && (
                        <p className="mt-1 text-stone-600">{payment.rejectionNote}</p>
                      )}
                      <p className="mt-2 text-xs text-stone-600">
                        Please upload a corrected receipt above.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
