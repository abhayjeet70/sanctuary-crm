import { AlertTriangle, Cake, Clock, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { CUISINES, DIETARY, MEALS, OCCASIONS, label, mealChoiceLines } from "@/lib/preferences";
import type { StayPreferences } from "@/types";

/**
 * What the guest told us, at a glance.
 *
 * Badges rather than a paragraph because these are read sideways — off a
 * kitchen board, off an arrivals list — and a sentence has to be finished
 * before it can be understood.
 *
 * `scope` is what stops every screen showing every field. The kitchen has no
 * use for a birthday, and the desk does not plan the menu.
 */
export function PreferenceBadges({
  preferences,
  scope = "all",
  className,
}: {
  preferences?: StayPreferences;
  scope?: "all" | "food" | "stay";
  className?: string;
}) {
  if (!preferences) return null;

  const showFood = scope === "all" || scope === "food";
  const showStay = scope === "all" || scope === "stay";

  const chips: { key: string; text: string; tone: "plain" | "warn" | "note" }[] = [];

  if (showFood) {
    if (preferences.dietary !== "none") {
      chips.push({ key: "diet", text: DIETARY[preferences.dietary], tone: "note" });
    }
    for (const meal of preferences.meals) {
      chips.push({ key: `m-${meal}`, text: label(MEALS, meal), tone: "plain" });
    }
    for (const cuisine of preferences.cuisines) {
      chips.push({ key: `c-${cuisine}`, text: label(CUISINES, cuisine), tone: "plain" });
    }
    // What they actually picked from the menu: the kitchen plans from this.
    for (const line of mealChoiceLines(preferences.mealChoices)) {
      chips.push({ key: `dish-${line}`, text: line, tone: "plain" });
    }
    // An allergy is the one line that must never be skimmed past, so it is
    // toned apart from the preferences around it.
    if (preferences.allergies.trim()) {
      chips.push({ key: "allergy", text: preferences.allergies.trim(), tone: "warn" });
    }
  }

  if (showStay) {
    for (const occasion of preferences.occasions) {
      chips.push({ key: `o-${occasion}`, text: label(OCCASIONS, occasion), tone: "note" });
    }
  }

  if (chips.length === 0) return null;

  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {chips.map((chip) => (
        <li
          key={chip.key}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium",
            chip.tone === "warn" && "bg-status-cancelled-bg text-status-cancelled",
            chip.tone === "note" && "bg-status-uploaded-bg text-status-uploaded",
            chip.tone === "plain" && "bg-sand-200 text-stone-600",
          )}
        >
          {chip.tone === "warn" && <AlertTriangle className="size-3" aria-hidden />}
          {chip.key === "diet" && <UtensilsCrossed className="size-3" aria-hidden />}
          {chip.key.startsWith("o-") && <Cake className="size-3" aria-hidden />}
          {chip.text}
        </li>
      ))}
    </ul>
  );
}

/** The arrival a guest arranged, written out only when they arranged one. */
export function ArrangedTime({
  arrival,
  departure,
  className,
}: {
  arrival?: string;
  departure?: string;
  className?: string;
}) {
  if (!arrival && !departure) return null;
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-stone-600", className)}>
      <Clock className="size-3.5 shrink-0" aria-hidden />
      {arrival && `Arriving ${arrival}`}
      {arrival && departure && " · "}
      {departure && `leaving ${departure}`}
    </p>
  );
}
