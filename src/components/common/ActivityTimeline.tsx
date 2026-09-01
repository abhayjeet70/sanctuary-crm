import {
  BookOpen,
  ChefHat,
  ClipboardList,
  MessageSquareQuote,
  Receipt,
  StickyNote,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { ActivityEvent, ActivityKind } from "@/types";
import { EmptyState } from "@/components/common";

const ICONS: Record<ActivityKind, typeof BookOpen> = {
  booking: BookOpen,
  payment: Wallet,
  food: ChefHat,
  request: ClipboardList,
  feedback: MessageSquareQuote,
  note: StickyNote,
  invoice: Receipt,
};

export function ActivityTimeline({
  events,
  className,
}: {
  events: ActivityEvent[];
  className?: string;
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={<StickyNote className="size-5" />}
        title="Nothing recorded yet"
        description="Actions taken on this booking will appear here in order."
      />
    );
  }

  return (
    <ol className={cn("relative space-y-5", className)}>
      {/* The spine, stopping short of the last dot rather than running past it. */}
      <span
        aria-hidden
        className="absolute top-2 bottom-2 left-[0.9375rem] w-px bg-gradient-to-b from-gold/45 to-gold/10"
      />
      {events.map((event) => {
        const Icon = ICONS[event.kind];
        return (
          <li key={event.id} className="relative flex gap-4">
            <span
              aria-hidden
              className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-gold-700 ring-1 ring-gold/35"
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-sm font-medium text-ink">{event.title}</p>
              {event.detail && (
                <p className="mt-0.5 text-sm text-stone-600">{event.detail}</p>
              )}
              <p className="mt-1 text-xs text-stone">
                {formatDateTime(event.at)} · {event.actor}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
