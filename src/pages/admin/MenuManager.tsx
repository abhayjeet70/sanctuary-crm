import { useState } from "react";
import { toast } from "sonner";
import { ImageUp, Pencil, Plus, Trash2, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, Eyebrow, StatusBadge } from "@/components/common";
import { useMenu, useMockData, useVillas } from "@/hooks/useData";
import { titleCase } from "@/lib/status";
import { money } from "@/lib/format";
import { supabase } from "@/services/supabase/client";
import { cn } from "@/lib/utils";
import type { MenuCategory, MenuItem } from "@/types";

const ALL_VILLAS = "__all__";
const CATEGORIES: MenuCategory[] = [
  "breakfast",
  "south_indian",
  "continental",
  "lunch",
  "dinner",
  "snacks",
  "beverages",
];

const blank = (): Partial<MenuItem> => ({
  name: "",
  description: "",
  price: 0,
  category: "breakfast",
  isVeg: true,
  available: true,
  image: "",
});

/**
 * The kitchen menu, editable.
 *
 * A dish with no villa is served everywhere — the common case, so it is the
 * default. Setting a villa limits the dish to that house, which is how one
 * kitchen can run a different card from another.
 */
export function MenuManager() {
  const menu = useMenu();
  const villas = useVillas();
  const { saveMenuItem, deleteMenuItem } = useMockData();

  const [editing, setEditing] = useState<Partial<MenuItem> | null>(null);
  const [removing, setRemoving] = useState<MenuItem | null>(null);
  const [filter, setFilter] = useState(ALL_VILLAS);
  const [uploading, setUploading] = useState(false);

  const shown =
    filter === ALL_VILLAS ? menu : menu.filter((m) => !m.villaId || m.villaId === filter);

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Choose an image file");
    if (file.size > 3 * 1024 * 1024) return toast.error("Images must be under 3 MB");

    setUploading(true);
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "-")}`;
    const { error } = await supabase.storage.from("menu-images").upload(path, file, {
      contentType: file.type,
    });
    setUploading(false);

    if (error) return toast.error("Could not upload", { description: error.message });

    // Dish photos are not sensitive, so the bucket is public and a plain URL
    // is enough — no signing round trip on every menu render.
    const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
    setEditing((prev) => ({ ...prev, image: data.publicUrl }));
    toast.success("Image uploaded");
  };

  const save = () => {
    if (!editing?.name?.trim()) return toast.error("The dish needs a name");
    if (!editing.category) return toast.error("Choose a category");
    saveMenuItem({ ...editing, name: editing.name.trim() });
    toast.success(editing.id ? "Dish updated" : "Dish added");
    setEditing(null);
  };

  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow className="text-gold-700">Kitchen menu</Eyebrow>
          <p className="mt-2 text-sm text-stone-600">
            {menu.length} dishes · {menu.filter((m) => !m.villaId).length} served at every
            villa
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-48" aria-label="Filter by villa">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VILLAS}>Every villa</SelectItem>
              {villas.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setEditing(blank())}>
            <Plus aria-hidden />
            Add a dish
          </Button>
        </div>
      </div>

      <hr className="rule-gold my-5" />

      {shown.length === 0 ? (
        <EmptyState
          icon={<Utensils className="size-5" />}
          title="No dishes yet"
          description="Add the first one, and it will appear in the guest portal straight away."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((item) => {
            const villa = villas.find((v) => v.id === item.villaId);
            return (
              <li
                key={item.id}
                className={cn(
                  "overflow-hidden rounded-xl bg-sand-200/40 ring-1 ring-gold/12",
                  !item.available && "opacity-60",
                )}
              >
                <div className="relative h-28">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-sand-300/50 text-stone">
                      <Utensils className="size-6" aria-hidden />
                    </div>
                  )}
                  <span className="absolute top-2 right-2">
                    <StatusBadge
                      label={villa ? villa.name.replace("Villa ", "") : "All villas"}
                      tone={villa ? "uploaded" : "confirmed"}
                    />
                  </span>
                </div>

                <div className="p-3">
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-1 flex size-3.5 shrink-0 items-center justify-center border",
                        item.isVeg ? "border-status-confirmed" : "border-status-cancelled",
                      )}
                      title={item.isVeg ? "Vegetarian" : "Non-vegetarian"}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 rounded-full",
                          item.isVeg ? "bg-status-confirmed" : "bg-status-cancelled",
                        )}
                      />
                    </span>
                    <p className="min-w-0 flex-1 text-sm font-medium text-ink">{item.name}</p>
                  </div>
                  <p className="mt-1 text-xs text-stone-600">
                    {titleCase(item.category)} · {money(item.price)}
                    {!item.available && " · unavailable"}
                  </p>
                  <div className="mt-2 flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                      <Pencil aria-hidden />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-status-cancelled hover:bg-status-cancelled-bg"
                      onClick={() => setRemoving(item)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ------------------------------------------------------------ editor */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="scrollbar-slim max-h-[90vh] overflow-y-auto p-6 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit dish" : "Add a dish"}</DialogTitle>
            <DialogDescription>
              It appears in the guest portal as soon as it is saved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dish-name">Name</Label>
              <Input
                id="dish-name"
                value={editing?.name ?? ""}
                onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                placeholder="Set Dosa with Vegetable Kurma"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dish-description">Description</Label>
              <Textarea
                id="dish-description"
                rows={3}
                value={editing?.description ?? ""}
                onChange={(e) => setEditing((p) => ({ ...p, description: e.target.value }))}
                placeholder="What is in it, and how it is served."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dish-price">Price</Label>
                <Input
                  id="dish-price"
                  type="number"
                  min={0}
                  step={10}
                  value={editing?.price ?? 0}
                  onChange={(e) =>
                    setEditing((p) => ({ ...p, price: Number(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dish-category">Category</Label>
                <Select
                  value={editing?.category ?? "breakfast"}
                  onValueChange={(v) => setEditing((p) => ({ ...p, category: v as MenuCategory }))}
                >
                  <SelectTrigger id="dish-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {titleCase(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dish-villa">Served at</Label>
              <Select
                value={editing?.villaId ?? ALL_VILLAS}
                onValueChange={(v) =>
                  setEditing((p) => ({ ...p, villaId: v === ALL_VILLAS ? undefined : v }))
                }
              >
                <SelectTrigger id="dish-villa" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VILLAS}>Every villa</SelectItem>
                  {villas.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} only
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-stone-600">
                Most dishes are served everywhere. Pick a villa only when one kitchen
                runs something the others do not.
              </p>
            </div>

            {/* Image */}
            <div className="space-y-2">
              <Label>Photo</Label>
              <div className="flex flex-wrap items-center gap-3">
                {editing?.image ? (
                  <img
                    src={editing.image}
                    alt=""
                    className="size-20 rounded-lg object-cover ring-1 ring-gold/25"
                  />
                ) : (
                  <div className="flex size-20 items-center justify-center rounded-lg bg-sand-200 text-stone">
                    <Utensils className="size-5" aria-hidden />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-sand-200 px-3 py-2 text-sm text-ink transition-colors hover:bg-sand-300">
                    <ImageUp className="size-4" aria-hidden />
                    {uploading ? "Uploading…" : "Upload a photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadImage(file);
                      }}
                    />
                  </label>
                  <Input
                    value={editing?.image ?? ""}
                    onChange={(e) => setEditing((p) => ({ ...p, image: e.target.value }))}
                    placeholder="…or paste an image URL"
                    aria-label="Image URL"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={editing?.isVeg ?? true}
                  onChange={(e) => setEditing((p) => ({ ...p, isVeg: e.target.checked }))}
                  className="size-4 accent-[var(--color-clay)]"
                />
                Vegetarian
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={editing?.available ?? true}
                  onChange={(e) => setEditing((p) => ({ ...p, available: e.target.checked }))}
                  className="size-4 accent-[var(--color-clay)]"
                />
                Available to order
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing?.id ? "Save changes" : "Add dish"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------------- removal */}
      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              It disappears from the guest menu. Orders already placed keep their own copy
              of the name and price, so past bills are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removing) deleteMenuItem(removing.id);
                toast.success("Dish removed");
                setRemoving(null);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
