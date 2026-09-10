import { useState } from "react";
import { toast } from "sonner";
import { MessageSquareQuote, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, Eyebrow } from "@/components/common";
import { useGuestStay } from "@/hooks/useGuest";
import { useMockData } from "@/hooks/useData";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Feedback } from "@/types";

const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Exceptional"];

export default function GuestFeedbackPage() {
  const { view, customer, feedback } = useGuestStay();
  const { createFeedback } = useMockData();

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  if (!view) return <ErrorState className="m-5" title="No stay found" />;

  const errors = {
    rating: rating < 1 ? "Choose a rating from one to five." : undefined,
    comment:
      comment.trim().length < 10
        ? "A sentence or two helps us more than a score alone."
        : undefined,
  };
  const blocked = Object.values(errors).some(Boolean);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (blocked) return;

    setSending(true);
    const entry: Feedback = {
      id: `fb-${Date.now()}`,
      bookingId: view.booking.id,
      customerId: customer?.id ?? "",
      villaId: view.booking.villaId,
      rating,
      comment: comment.trim(),
      reviewed: false,
      createdAt: new Date().toISOString(),
    };

    const { error } = await createFeedback(entry);
    setSending(false);
    if (error) return;

    setRating(0);
    setComment("");
    setSubmitted(false);
    toast.success("Thank you — that has reached us", {
      description: "We read every one of these.",
    });
  };

  const shown = hover || rating;

  return (
    <div className="space-y-6 p-5 sm:p-8">
      <header>
        <Eyebrow className="text-gold-700">How was it?</Eyebrow>
        <h1 className="display-caps mt-2 text-3xl text-ink sm:text-4xl">Feedback</h1>
        <p className="mt-2 max-w-lg text-sm text-stone-600">
          Honestly, please. It goes straight to the owner rather than a review site.
        </p>
      </header>

      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.07]"
      >
        <fieldset>
          <legend className="label-caps mb-3">Your rating</legend>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  onMouseEnter={() => setHover(value)}
                  onFocus={() => setHover(value)}
                  onBlur={() => setHover(0)}
                  aria-label={`${value} out of 5 — ${RATING_WORDS[value]}`}
                  aria-pressed={rating === value}
                  className="rounded-lg p-1 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  <Star
                    className={cn(
                      "size-8 transition-colors",
                      value <= shown ? "fill-gold text-gold" : "text-stone-300",
                    )}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
            {/* The word carries the meaning — never the stars alone. */}
            <span className="text-sm text-stone-600" aria-live="polite">
              {shown > 0 ? RATING_WORDS[shown] : "Not rated yet"}
            </span>
          </div>
          {submitted && errors.rating && (
            <p role="alert" className="mt-2 text-xs text-status-cancelled">
              {errors.rating}
            </p>
          )}
        </fieldset>

        <div className="mt-5 space-y-1.5">
          <Label htmlFor="feedback-comment">Tell us about your stay</Label>
          <Textarea
            id="feedback-comment"
            rows={5}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="What we got right, and what we should fix before your next visit."
            aria-invalid={submitted && Boolean(errors.comment)}
            aria-describedby="feedback-comment-error"
          />
          {submitted && errors.comment && (
            <p
              id="feedback-comment-error"
              role="alert"
              className="text-xs text-status-cancelled"
            >
              {errors.comment}
            </p>
          )}
        </div>

        <Button type="submit" className="mt-5 w-full sm:w-auto" disabled={sending}>
          {sending ? "Sending…" : "Send feedback"}
        </Button>
      </form>

      <section>
        <Eyebrow className="mb-3 text-gold-700">What you have sent us</Eyebrow>
        {feedback.length === 0 ? (
          <EmptyState
            icon={<MessageSquareQuote className="size-5" />}
            title="Nothing sent yet"
            description="Anything you write appears here, along with our reply."
          />
        ) : (
          <ul className="space-y-3">
            {feedback.map((entry) => (
              <li
                key={entry.id}
                className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.06]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span className="text-gold" aria-hidden>
                      {"★".repeat(entry.rating)}
                      <span className="text-stone-300">{"★".repeat(5 - entry.rating)}</span>
                    </span>
                    <span className="text-sm text-stone-600">
                      {RATING_WORDS[entry.rating]}
                    </span>
                  </span>
                  <span className="text-xs text-stone">
                    {formatDate(entry.createdAt.slice(0, 10))}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink">{entry.comment}</p>
                {entry.reply && (
                  <div className="mt-4 rounded-lg bg-sand-200/70 p-4">
                    <Eyebrow className="text-gold-700">Homes of Sanctuary replied</Eyebrow>
                    <p className="mt-1.5 text-sm text-ink">{entry.reply}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
