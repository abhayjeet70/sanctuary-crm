import { useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/common";
import { useMockData, useVillas } from "@/hooks/useData";
import { ACCEPTED_PHOTO_TYPES, uploadVillaPhoto } from "@/services/supabase/receipts";
import { cn } from "@/lib/utils";

/**
 * Photographs of every villa and room — what guests browse in the booking
 * window before they choose. The villa's cover is `image`; the rest is
 * `gallery`. Rooms have a gallery of their own.
 */
export default function MediaPage() {
  const villas = useVillas();
  const { updateVilla, saveRoom } = useMockData();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Property"
        title="Media"
        description="Photographs guests see when choosing a villa or room. JPG, PNG or WebP, up to 5 MB each."
      />

      {villas.length === 0 && <EmptyState title="No villas yet" description="Add a villa first." />}

      {villas.map((villa) => (
        <section
          key={villa.id}
          aria-labelledby={`media-${villa.id}`}
          className="space-y-5 rounded-xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.06] sm:p-6"
        >
          <h2 id={`media-${villa.id}`} className="text-xl text-ink">
            {villa.name}
          </h2>

          <PhotoSet
            label="Villa photos"
            folder={villa.id}
            photos={[villa.image, ...villa.gallery].filter(Boolean)}
            cover={villa.image}
            onChange={(photos) => updateVilla(villa.id, { image: photos[0] ?? "", gallery: photos.slice(1) })}
          />

          {villa.rooms.length > 0 && (
            <div className="grid grid-cols-1 gap-5 border-t border-ink/8 pt-5 lg:grid-cols-2">
              {villa.rooms.map((room) => (
                <PhotoSet
                  key={room.id}
                  label={room.name}
                  folder={`${villa.id}/rooms/${room.id}`}
                  photos={room.gallery ?? []}
                  onChange={(gallery) => saveRoom(villa.id, { ...room, gallery })}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/** One set of photos: the first is the cover. */
function PhotoSet({
  label,
  folder,
  photos,
  cover,
  onChange,
}: {
  label: string;
  folder: string;
  photos: string[];
  cover?: string;
  onChange: (photos: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const added: string[] = [];
    for (const file of Array.from(files)) {
      const { url, error } = await uploadVillaPhoto(folder, file);
      if (error) toast.error(`${file.name}: ${error}`);
      if (url) added.push(url);
    }
    setBusy(false);
    if (added.length) {
      onChange([...photos, ...added]);
      toast.success(`${added.length} ${added.length === 1 ? "photo" : "photos"} added`);
    }
  };

  const inputId = `upload-${folder.replace(/\W/g, "-")}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="label-caps text-gold-700">
          {label} · {photos.length}
        </h3>
        <Button asChild size="sm" variant="outline" disabled={busy}>
          <label htmlFor={inputId} className="cursor-pointer">
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
            {busy ? "Uploading…" : "Upload photos"}
            <input
              id={inputId}
              type="file"
              multiple
              accept={ACCEPTED_PHOTO_TYPES.join(",")}
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
      </div>

      {photos.length === 0 ? (
        <p className="mt-3 rounded-lg bg-sand-200/50 p-4 text-sm text-stone-600">
          No photos yet — guests will see the bundled placeholder.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {photos.map((src, i) => (
            <li key={src + i} className="group relative overflow-hidden rounded-lg ring-1 ring-ink/10">
              <img src={src} alt={`${label}, photo ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
              {i === 0 && (
                <span className="absolute top-2 left-2 rounded bg-ink/80 px-1.5 py-0.5 text-[0.6875rem] text-white">
                  Cover
                </span>
              )}
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-ink/70 p-2",
                  "opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100",
                )}
              >
                {i > 0 && (
                  <Button
                    size="icon"
                    variant="secondary"
                    className="size-8"
                    aria-label={`Make photo ${i + 1} the cover`}
                    onClick={() => onChange([src, ...photos.filter((_, j) => j !== i)])}
                  >
                    <Star aria-hidden />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="secondary"
                  className="size-8"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => {
                    const what = src === cover ? "the cover photo" : `photo ${i + 1}`;
                    if (!window.confirm(`Remove ${what} from ${label}? Guests will no longer see it.`)) return;
                    onChange(photos.filter((_, j) => j !== i));
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
