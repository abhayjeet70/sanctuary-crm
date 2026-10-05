import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChipGroup, DiningDetails } from "@/components/booking/StayInfo";
import { MealChoices } from "@/components/booking/MealChoices";
import { CUISINES, DIETARY_OPTIONS, MEALS, OCCASIONS, toggle } from "@/lib/preferences";
import type { DietaryPreference, PropertySettings, StayPreferencesDraft } from "@/types";

/**
 * Food & wishes — what the kitchen and the desk read for a stay.
 *
 * Asked in the guest portal once the booking exists, not in the booking
 * window: choosing a house should not wait on choosing breakfast.
 */
export function FoodWishesForm({
  value: prefs,
  onChange: setPrefs,
  settings,
}: {
  value: StayPreferencesDraft;
  onChange: (next: StayPreferencesDraft) => void;
  settings: Partial<PropertySettings> | null;
}) {
  return (
    <div className="space-y-5">
      <MealChoices
        value={prefs.mealChoices}
        onChange={(mealChoices) => setPrefs({ ...prefs, mealChoices })}
      />
      <DiningDetails settings={settings} />
      <div className="space-y-1.5">
        <Label htmlFor="fw-dietary">Dietary preference</Label>
        <Select
          value={prefs.dietary}
          onValueChange={(v) => setPrefs({ ...prefs, dietary: v as DietaryPreference })}
        >
          <SelectTrigger id="fw-dietary" className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIETARY_OPTIONS.map(([value, text]) => (
              <SelectItem key={value} value={value}>
                {text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ChipGroup
        legend="Meals you would like"
        options={MEALS}
        selected={prefs.meals}
        onToggle={(v) => setPrefs({ ...prefs, meals: toggle(prefs.meals, v) })}
      />
      <ChipGroup
        legend="Kinds of food"
        options={CUISINES}
        selected={prefs.cuisines}
        onToggle={(v) => setPrefs({ ...prefs, cuisines: toggle(prefs.cuisines, v) })}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fw-allergies">Allergies</Label>
          <Input
            id="fw-allergies"
            value={prefs.allergies}
            onChange={(e) => setPrefs({ ...prefs, allergies: e.target.value })}
          />
          <p className="text-xs text-stone-600">Anything the kitchen must never serve.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fw-diet-notes">Dietary restrictions</Label>
          <Input
            id="fw-diet-notes"
            value={prefs.dietaryNotes}
            onChange={(e) => setPrefs({ ...prefs, dietaryNotes: e.target.value })}
            placeholder="No onion or garlic"
          />
        </div>
      </div>
      <ChipGroup
        legend="Anything we should arrange"
        options={OCCASIONS}
        selected={prefs.occasions}
        onToggle={(v) => setPrefs({ ...prefs, occasions: toggle(prefs.occasions, v) })}
      />
      <div className="space-y-1.5">
        <Label htmlFor="fw-requests">In your own words (optional)</Label>
        <Textarea
          id="fw-requests"
          rows={2}
          value={prefs.specialRequests}
          onChange={(e) => setPrefs({ ...prefs, specialRequests: e.target.value })}
        />
      </div>
    </div>
  );
}
