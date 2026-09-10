import { useState } from "react";
import { toast } from "sonner";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Titles most properties use, offered before anyone has to type.
 *
 * Grouped by the department that usually owns them, and matched on the slug
 * the department was created with. A department the owner invented has no
 * match, so it falls back to the general list and the free-text option — which
 * is the point of having the free-text option.
 */
const BY_DEPARTMENT: Record<string, string[]> = {
  housekeeping: [
    "Villa attendant",
    "Housekeeping supervisor",
    "Laundry attendant",
    "Linen keeper",
    "Houseman",
  ],
  kitchen: [
    "Head chef",
    "Sous chef",
    "Chef de partie",
    "Commis chef",
    "Kitchen assistant",
    "Steward",
    "Baker",
  ],
  maintenance: [
    "Maintenance technician",
    "Electrician",
    "Plumber",
    "Pool technician",
    "Gardener",
  ],
  manager: [
    "Operations manager",
    "Front desk executive",
    "Guest relations",
    "Reservations executive",
    "Duty manager",
  ],
};

const GENERAL = [
  "Supervisor",
  "Attendant",
  "Assistant",
  "Trainee",
  "Driver",
  "Security guard",
];

const CUSTOM = "__custom__";

/**
 * The job titles a department offers.
 *
 * Saves on every change rather than behind a button, which is how the
 * permission checkboxes above it already behave — two different save models on
 * one card is how someone loses a change they thought they had made.
 */
export function JobTitlesEditor({
  id,
  slug,
  titles,
  onChange,
}: {
  id: string;
  /** Picks the suggestion list. Unknown slugs get the general one. */
  slug: string;
  titles: string[];
  onChange: (titles: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");

  const suggestions = [...(BY_DEPARTMENT[slug] ?? []), ...GENERAL].filter(
    (title) => !titles.some((t) => t.toLowerCase() === title.toLowerCase()),
  );

  const add = (title: string) => {
    const clean = title.trim();
    if (clean.length < 2) return toast.error("That is too short to be a job title");
    if (titles.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      return toast.error(`${clean} is already listed`);
    }
    onChange([...titles, clean]);
    setCustom("");
    setAdding(false);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`titles-${id}`}>Job titles</Label>

      {titles.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {titles.map((title) => (
            <li
              key={title}
              className="flex items-center gap-1 rounded-full bg-sand-200 py-1.5 pr-1.5 pl-3 text-sm text-ink"
            >
              {title}
              <button
                type="button"
                aria-label={`Remove ${title}`}
                onClick={() => onChange(titles.filter((t) => t !== title))}
                className="rounded-full p-0.5 text-stone transition-colors hover:bg-white hover:text-ink"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-600">
          None yet. The employee form will accept any title typed by hand.
        </p>
      )}

      {adding ? (
        <div className="flex max-w-sm gap-2">
          <Input
            id={`titles-${id}`}
            autoFocus
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(custom);
              }
              if (event.key === "Escape") {
                setAdding(false);
                setCustom("");
              }
            }}
            placeholder="Spa therapist"
          />
          <Button type="button" size="icon" aria-label="Add this title" onClick={() => add(custom)}>
            <Check aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cancel"
            onClick={() => {
              setAdding(false);
              setCustom("");
            }}
          >
            <X aria-hidden />
          </Button>
        </div>
      ) : (
        <Select
          value=""
          onValueChange={(value) => (value === CUSTOM ? setAdding(true) : add(value))}
        >
          <SelectTrigger id={`titles-${id}`} className="w-full max-w-sm">
            <SelectValue placeholder="Add a job title…" />
          </SelectTrigger>
          <SelectContent>
            {suggestions.map((title) => (
              <SelectItem key={title} value={title}>
                {title}
              </SelectItem>
            ))}
            {suggestions.length > 0 && <SelectSeparator />}
            <SelectItem value={CUSTOM}>
              <span className="flex items-center gap-2 text-clay">
                <Plus className="size-3.5" aria-hidden />
                Something else…
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      )}

      <p className="text-xs text-stone-600">
        Offered when adding someone to this department. Saved as you change them.
      </p>
    </div>
  );
}
