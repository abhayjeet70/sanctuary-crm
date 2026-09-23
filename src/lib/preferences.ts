import type { DietaryPreference, StayPreferences, StayPreferencesDraft } from "@/types";

/**
 * The words the property uses for what a guest asks for.
 *
 * One list, read by the guest form, the admin cards and the department views,
 * so the kitchen never sees a label the guest was not offered. The stored
 * values are the slugs; these are only how they are written down.
 */

export const DIETARY: Record<DietaryPreference, string> = {
  none: "No preference",
  vegetarian: "Vegetarian",
  jain: "Jain",
  vegan: "Vegan",
  eggetarian: "Eggetarian",
  non_vegetarian: "Non-vegetarian",
};

export const DIETARY_OPTIONS = Object.entries(DIETARY) as [DietaryPreference, string][];

export const MEALS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

export const CUISINES: Record<string, string> = {
  indian: "Indian",
  north_indian: "North Indian",
  south_indian: "South Indian",
  continental: "Continental",
  asian: "Asian",
  kids: "Kids' meals",
};

export const OCCASIONS: Record<string, string> = {
  late_arrival: "Late arrival",
  early_departure: "Early departure",
  birthday: "Birthday",
  anniversary: "Anniversary",
  children: "Travelling with children",
  accessibility: "Accessibility needs",
  other: "Something else",
};

/** A slug written out, falling back to the slug itself so an older value
 *  still reads as something rather than disappearing. */
export const label = (dictionary: Record<string, string>, value: string) =>
  dictionary[value] ?? value.replace(/_/g, " ");

export const EMPTY_PREFERENCES: StayPreferencesDraft = {
  dietary: "none",
  meals: [],
  cuisines: [],
  allergies: "",
  dietaryNotes: "",
  foodNotes: "",
  occasions: [],
  specialRequests: "",
};

/** True when the guest actually told us something worth showing. */
export function hasPreferences(prefs?: StayPreferences | StayPreferencesDraft): boolean {
  if (!prefs) return false;
  return Boolean(
    (prefs.dietary && prefs.dietary !== "none") ||
      prefs.meals.length ||
      prefs.cuisines.length ||
      prefs.allergies.trim() ||
      prefs.dietaryNotes.trim() ||
      prefs.foodNotes.trim() ||
      prefs.occasions.length ||
      prefs.specialRequests.trim(),
  );
}

/** Toggle a slug in one of the array fields. */
export const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/**
 * What the kitchen needs, in one line, for a board that has no room for a card.
 * Empty when there is nothing dietary to say — a blank line is better than
 * "No preference" repeated down a column.
 */
export function kitchenLine(prefs?: StayPreferences): string {
  if (!prefs) return "";
  const parts: string[] = [];
  if (prefs.dietary !== "none") parts.push(DIETARY[prefs.dietary]);
  if (prefs.allergies.trim()) parts.push(`Allergies: ${prefs.allergies.trim()}`);
  if (prefs.dietaryNotes.trim()) parts.push(prefs.dietaryNotes.trim());
  return parts.join(" · ");
}
