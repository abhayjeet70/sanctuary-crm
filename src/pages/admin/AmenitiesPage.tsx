import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Sparkles, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PageHeader, StatCard } from "@/components/common";
import { useMockData, useVillas } from "@/hooks/useData";
import type { Villa } from "@/types";

/**
 * What each villa offers, in one place.
 *
 * The villa detail page can edit this too, but a single board is how you keep
 * three villas describing themselves consistently — you can see at a glance
 * that only one of them lists a plunge pool.
 */
export default function AmenitiesPage() {
  const villas = useVillas();
  const all = new Set(villas.flatMap((v) => v.amenities));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="What each villa offers"
        title="Amenities"
        description="The list a guest reads before they arrive, and the one the desk quotes on the phone."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Distinct amenities"
          value={all.size}
          icon={<Sparkles className="size-4" />}
        />
        <StatCard label="Villas" value={villas.length} />
        <StatCard
          label="Most generous"
          value={
            [...villas].sort((a, b) => b.amenities.length - a.amenities.length)[0]?.name ?? "—"
          }
          hint="By number of amenities listed"
        />
        <StatCard
          label="Listed everywhere"
          value={[...all].filter((a) => villas.every((v) => v.amenities.includes(a))).length}
          hint="Offered by every villa"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {villas.map((villa) => (
          <VillaAmenities key={villa.id} villa={villa} />
        ))}
      </div>
    </div>
  );
}

function VillaAmenities({ villa }: { villa: Villa }) {
  const { updateVilla } = useMockData();
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value || villa.amenities.includes(value)) return;
    updateVilla(villa.id, { amenities: [...villa.amenities, value] });
    setDraft("");
  };

  return (
    <section className="flex flex-col rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]">
      <img
        src={villa.image}
        alt=""
        aria-hidden
        className="h-36 w-full rounded-t-xl object-cover"
      />
      <div className="flex flex-1 flex-col p-5">
        <Link
          to={`/admin/villas/${villa.id}`}
          className="text-lg text-ink hover:text-clay-600"
        >
          {villa.name}
        </Link>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-600">
          <Wifi className="size-3.5" aria-hidden />
          {villa.wifiNetwork || "No network set"}
        </p>

        {villa.amenities.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<Sparkles className="size-5" />}
            title="Nothing listed"
            description="Add what this villa offers so the guest portal can show it."
          />
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {villa.amenities.map((amenity) => (
              <li
                key={amenity}
                className="inline-flex items-center gap-1 rounded-full bg-sand-200 py-1 pr-1 pl-3 text-xs text-ink"
              >
                {amenity}
                <button
                  type="button"
                  aria-label={`Remove ${amenity} from ${villa.name}`}
                  onClick={() =>
                    updateVilla(villa.id, {
                      amenities: villa.amenities.filter((a) => a !== amenity),
                    })
                  }
                  className="rounded-full p-0.5 text-stone hover:bg-ink/8 hover:text-ink"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-auto flex items-end gap-2 pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <div className="min-w-0 flex-1">
            <Label htmlFor={`amenity-${villa.id}`} className="sr-only">
              Add an amenity to {villa.name}
            </Label>
            <Input
              id={`amenity-${villa.id}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Outdoor bathtub"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={!draft.trim()}>
            <Plus aria-hidden />
            Add
          </Button>
        </form>
      </div>
    </section>
  );
}
