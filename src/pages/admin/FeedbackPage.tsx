import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Check, MessageSquareQuote, Reply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, Eyebrow, PageHeader, StatCard, StatusBadge } from "@/components/common";
import { useFeedbackViews, useMockData, useVillas } from "@/hooks/useData";
import { formatDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const ALL = "all";

/** Stars carry a text label too — a rating is never colour or shape alone. */
function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-gold" title={`${rating} out of 5`}>
      <span aria-hidden>
        {"★".repeat(rating)}
        <span className="text-stone-300">{"★".repeat(5 - rating)}</span>
      </span>
      <span className="sr-only">{rating} out of 5</span>
    </span>
  );
}

export default function FeedbackPage() {
  const entries = useFeedbackViews();
  const villas = useVillas();
  const { updateFeedback } = useMockData();
  const [villaId, setVillaId] = useState(ALL);
  const [reviewed, setReviewed] = useState(ALL);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const filtered = useMemo(
    () =>
      entries
        .filter((e) => (villaId === ALL ? true : e.entry.villaId === villaId))
        .filter((e) =>
          reviewed === ALL ? true : reviewed === "yes" ? e.entry.reviewed : !e.entry.reviewed,
        )
        .sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt)),
    [entries, villaId, reviewed],
  );

  const average =
    entries.length > 0
      ? entries.reduce((sum, e) => sum + e.entry.rating, 0) / entries.length
      : 0;
  const unreviewed = entries.filter((e) => !e.entry.reviewed).length;

  const sendReply = (id: string) => {
    const text = draft.trim();
    if (!text) return;
    updateFeedback(id, { reply: text, reviewed: true });
    setReplyingTo(null);
    setDraft("");
    toast.success("Reply saved", { description: "The guest sees it on their feedback page." });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="What guests said after they left"
        title="Feedback"
        description="Read it, reply to it, and mark it reviewed so nothing sits unanswered."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Average rating"
          value={average.toFixed(1)}
          hint={`${entries.length} responses`}
          tone="accent"
        />
        <StatCard
          label="Awaiting review"
          value={unreviewed}
          tone={unreviewed > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Five stars"
          value={entries.filter((e) => e.entry.rating === 5).length}
        />
        <StatCard
          label="Three or below"
          value={entries.filter((e) => e.entry.rating <= 3).length}
        />
      </div>

      <div className="flex flex-wrap gap-4 rounded-xl bg-white p-4 shadow-soft ring-1 ring-ink/[0.06]">
        <div className="w-48 space-y-1.5">
          <Label htmlFor="feedback-villa">Villa</Label>
          <Select value={villaId} onValueChange={setVillaId}>
            <SelectTrigger id="feedback-villa" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All villas</SelectItem>
              {villas.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48 space-y-1.5">
          <Label htmlFor="feedback-reviewed">Review state</Label>
          <Select value={reviewed} onValueChange={setReviewed}>
            <SelectTrigger id="feedback-reviewed" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everything</SelectItem>
              <SelectItem value="no">Awaiting review</SelectItem>
              <SelectItem value="yes">Reviewed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<MessageSquareQuote className="size-5" />}
          title="No feedback matches those filters"
        />
      ) : (
        <ul className="space-y-4">
          {filtered.map(({ entry, villa, customer, booking }) => (
            <li
              key={entry.id}
              className={cn(
                "rounded-xl bg-white p-6 shadow-soft ring-1",
                entry.reviewed ? "ring-ink/[0.06]" : "ring-gold/40",
              )}
            >
              <div className="flex flex-wrap items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-sm font-semibold text-gold-700">
                  {initials(customer?.name ?? "")}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      to={`/admin/customers/${customer?.id}`}
                      className="font-medium text-ink underline-offset-4 hover:text-clay-600 hover:underline"
                    >
                      {customer?.name}
                    </Link>
                    <Stars rating={entry.rating} />
                    <StatusBadge
                      label={entry.reviewed ? "Reviewed" : "Awaiting review"}
                      tone={entry.reviewed ? "completed" : "pending"}
                    />
                  </div>

                  <p className="mt-1 text-xs text-stone-600">
                    {villa?.name} ·{" "}
                    {booking && (
                      <Link
                        to={`/admin/bookings/${booking.id}`}
                        className="underline-offset-4 hover:text-clay-600 hover:underline"
                      >
                        {booking.reference}
                      </Link>
                    )}{" "}
                    · {formatDate(entry.createdAt.slice(0, 10))}
                  </p>

                  <blockquote className="mt-3 border-l-2 border-gold/40 pl-4 text-sm leading-relaxed text-ink">
                    {entry.comment}
                  </blockquote>

                  {entry.reply && (
                    <div className="mt-4 rounded-lg bg-sand-200/70 p-4">
                      <Eyebrow className="text-gold-700">Your reply</Eyebrow>
                      <p className="mt-1.5 text-sm text-ink">{entry.reply}</p>
                    </div>
                  )}

                  {replyingTo === entry.id ? (
                    <div className="mt-4 space-y-2">
                      <Label htmlFor={`reply-${entry.id}`}>Reply to {customer?.name}</Label>
                      <Textarea
                        id={`reply-${entry.id}`}
                        rows={3}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Thank you for staying with us — we have passed this on to the team."
                      />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={!draft.trim()} onClick={() => sendReply(entry.id)}>
                          Send reply
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReplyingTo(null);
                            setDraft("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setReplyingTo(entry.id);
                          setDraft(entry.reply ?? "");
                        }}
                      >
                        <Reply aria-hidden />
                        {entry.reply ? "Edit reply" : "Reply"}
                      </Button>
                      {!entry.reviewed && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            updateFeedback(entry.id, { reviewed: true });
                            toast.success("Marked as reviewed");
                          }}
                        >
                          <Check aria-hidden />
                          Mark reviewed
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
