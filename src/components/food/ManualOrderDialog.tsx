import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBookingViews, useMenuForVilla, useMockData } from "@/hooks/useData";
import { money } from "@/lib/format";
import { supabase } from "@/services/supabase/client";

/**
 * An order taken by hand — a call from the villa, or a word at the door.
 * Goes straight to Confirmed, since the person who took it already confirmed it.
 */
export function ManualOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { refetch } = useMockData();
  const stays = useBookingViews().filter((v) =>
    ["confirmed", "checked_in", "in_house"].includes(v.booking.status),
  );
  const [bookingId, setBookingId] = useState("");
  const stay = stays.find((v) => v.booking.id === bookingId);
  const menu = useMenuForVilla(stay?.booking.villaId).filter((m) => m.available);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const lines = Object.entries(cart).filter(([, q]) => q > 0);
  const total = lines.reduce((s, [id, q]) => s + (menu.find((m) => m.id === id)?.price ?? 0) * q, 0);
  const bump = (id: string, by: number) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + by) }));

  const place = async () => {
    if (!bookingId) return toast.error("Choose whose order it is");
    if (!lines.length) return toast.error("Add at least one dish");
    setSaving(true);
    const { error } = await supabase.rpc("place_manual_food_order", {
      p_booking_id: bookingId,
      p_lines: lines.map(([menu_item_id, quantity]) => ({ menu_item_id, quantity })),
      p_notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error("Could not place the order", { description: error.message });
    toast.success(`Order taken for ${stay?.customer?.name}`);
    setCart({});
    setNotes("");
    setBookingId("");
    onOpenChange(false);
    await refetch();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New manual order</DialogTitle>
          <DialogDescription>For a guest who rang or asked in person.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="mo-stay">Guest</Label>
          <Select
            value={bookingId}
            onValueChange={(v) => {
              setBookingId(v);
              setCart({});
            }}
          >
            <SelectTrigger id="mo-stay" className="w-full">
              <SelectValue placeholder="Choose a current stay" />
            </SelectTrigger>
            <SelectContent>
              {stays.map((v) => (
                <SelectItem key={v.booking.id} value={v.booking.id}>
                  {v.customer?.name} · {v.villa?.name}
                  {v.roomNames.length > 0 && ` (${v.roomNames.join(", ")})`} · {v.booking.reference}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {stay && (
          <ul className="max-h-72 divide-y divide-ink/8 overflow-y-auto rounded-lg ring-1 ring-ink/10">
            {menu.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{item.name}</span>
                  <span className="text-xs text-stone-600">
                    {item.category} · {money(item.price)}
                  </span>
                </span>
                <Button size="icon" variant="outline" className="size-8" onClick={() => bump(item.id, -1)} aria-label={`One fewer ${item.name}`}>
                  <Minus aria-hidden />
                </Button>
                <span className="w-6 text-center tabular-nums" aria-live="polite">
                  {cart[item.id] ?? 0}
                </span>
                <Button size="icon" variant="outline" className="size-8" onClick={() => bump(item.id, 1)} aria-label={`One more ${item.name}`}>
                  <Plus aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="mo-notes">Notes for the kitchen</Label>
          <Textarea id="mo-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <DialogFooter className="items-center gap-3">
          <span className="mr-auto font-display text-xl text-ink tabular-nums">{money(total)}</span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void place()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Place order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
