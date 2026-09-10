import { useState } from "react";
import { toast } from "sonner";
import { ConciergeBell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, Eyebrow, StatusBadge } from "@/components/common";
import { useGuestStay } from "@/hooks/useGuest";
import { useMockData } from "@/hooks/useData";
import { requestStatus, titleCase } from "@/lib/status";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GuestRequest, RequestCategory } from "@/types";

const CATEGORIES: { value: RequestCategory; label: string; hint: string }[] = [
  { value: "housekeeping", label: "Housekeeping", hint: "Cleaning, turndown, laundry" },
  { value: "extra_towels", label: "Extra towels", hint: "Bath, pool or hand towels" },
  { value: "food", label: "Food & drink", hint: "Anything outside the menu" },
  { value: "maintenance", label: "Maintenance", hint: "Something is not working" },
  { value: "transport", label: "Transport", hint: "Cabs, airport, local trips" },
  { value: "wifi", label: "Wi-Fi", hint: "Connection trouble" },
  { value: "room_setup", label: "Room setup", hint: "Furniture, cots, decor" },
  { value: "other", label: "Something else", hint: "Tell us below" },
];

export default function GuestRequestsPage() {
  const { view, customer, requests } = useGuestStay();
  const { createRequest } = useMockData();

  const [category, setCategory] = useState<RequestCategory | null>(null);
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  if (!view) return <ErrorState className="m-5" title="No stay found" />;

  const errors = {
    category: !category ? "Pick what this is about." : undefined,
    description:
      description.trim().length < 5
        ? "Tell us a little more so we can get it right."
        : undefined,
  };
  const blocked = Object.values(errors).some(Boolean);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (blocked || !category) return;

    setSending(true);
    const request: GuestRequest = {
      id: `q-${Date.now()}`,
      reference: `REQ-${String(Date.now()).slice(-4)}`,
      bookingId: view.booking.id,
      customerId: customer?.id ?? "",
      villaId: view.booking.villaId,
      category,
      description: description.trim(),
      // Guests open at normal whatever the category; RLS refuses anything
      // higher, and the desk raises it if the job warrants.
      priority: "normal",
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const { error } = await createRequest(request);
    setSending(false);
    if (error) return;

    setCategory(null);
    setDescription("");
    setSubmitted(false);
    toast.success("Request sent", {
      description: "Someone from the team will pick this up shortly.",
    });
  };

  return (
    <div className="space-y-6 p-5 sm:p-8">
      <header>
        <Eyebrow className="text-gold-700">Anything you need</Eyebrow>
        <h1 className="display-caps mt-2 text-3xl text-ink sm:text-4xl">Requests</h1>
        <p className="mt-2 max-w-lg text-sm text-stone-600">
          Ask here rather than hunting for someone. Everything lands with the right team
          straight away.
        </p>
      </header>

      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.07]"
      >
        <fieldset>
          <legend className="label-caps mb-3">What is this about?</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "cursor-pointer rounded-xl p-3 transition-colors",
                  category === option.value
                    ? "bg-gold/12 ring-2 ring-gold"
                    : "bg-sand-200/60 hover:bg-sand-300/60",
                )}
              >
                <input
                  type="radio"
                  name="category"
                  value={option.value}
                  checked={category === option.value}
                  onChange={() => setCategory(option.value)}
                  className="sr-only"
                />
                <span className="block text-sm font-medium text-ink">{option.label}</span>
                <span className="mt-0.5 block text-xs text-stone-600">{option.hint}</span>
              </label>
            ))}
          </div>
          {submitted && errors.category && (
            <p role="alert" className="mt-2 text-xs text-status-cancelled">
              {errors.category}
            </p>
          )}
        </fieldset>

        <div className="mt-5 space-y-1.5">
          <Label htmlFor="request-description">Tell us more</Label>
          <Textarea
            id="request-description"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Could we get two extra bath towels for the west bedroom, any time this afternoon?"
            aria-invalid={submitted && Boolean(errors.description)}
            aria-describedby="request-description-error"
          />
          {submitted && errors.description && (
            <p
              id="request-description-error"
              role="alert"
              className="text-xs text-status-cancelled"
            >
              {errors.description}
            </p>
          )}
        </div>

        <Button type="submit" className="mt-5 w-full sm:w-auto" disabled={sending}>
          {sending ? "Sending…" : "Send request"}
        </Button>
      </form>

      <section>
        <Eyebrow className="mb-3 text-gold-700">Your requests</Eyebrow>
        {requests.length === 0 ? (
          <EmptyState
            icon={<ConciergeBell className="size-5" />}
            title="Nothing asked for yet"
            description="Anything you send will show up here with its progress."
          />
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => {
              const state = requestStatus.get(request.status);
              return (
                <li
                  key={request.id}
                  className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.06]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-gold-700">
                        {titleCase(request.category)} · {request.reference}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink">
                        {request.description}
                      </p>
                      <p className="mt-2 text-xs text-stone">
                        {formatDateTime(request.createdAt)}
                        {request.assignedTo && ` · with ${titleCase(request.assignedTo)}`}
                      </p>
                    </div>
                    <StatusBadge label={state.label} tone={state.tone} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
