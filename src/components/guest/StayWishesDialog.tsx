import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FoodWishesForm } from "@/components/booking/FoodWishesForm";
import { useMockData, useStayPreferences } from "@/hooks/useData";
import { useGuestStay } from "@/hooks/useGuest";
import { EMPTY_PREFERENCES, hasPreferences } from "@/lib/preferences";
import { money } from "@/lib/format";
import { supabase } from "@/services/supabase/client";
import type { StayPreferencesDraft } from "@/types";

const SEEN = "hos-stay-wishes-seen:";

/**
 * The first thing a guest sees after booking: what is owed, and what they
 * would like to eat. Shown until food & wishes are answered (or "Later" is
 * pressed this browser session); otherwise renders `fallback`.
 */
export function StayWishesDialog({ fallback }: { fallback: ReactNode }) {
  const { view } = useGuestStay();
  const { settings, refetch } = useMockData();
  const saved = useStayPreferences().find((p) => p.bookingId === view?.booking.id);
  const answered = hasPreferences(saved && { ...saved, specialRequests: "" });

  const bookingId = view?.booking.id ?? "";
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(SEEN + bookingId) !== "1";
    } catch {
      return true;
    }
  });
  const [prefs, setPrefs] = useState<StayPreferencesDraft>(() =>
    saved ? { ...EMPTY_PREFERENCES, ...saved } : EMPTY_PREFERENCES,
  );
  const [saving, setSaving] = useState(false);

  if (!view || answered) return <>{fallback}</>;

  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(SEEN + bookingId, "1");
    } catch {
      // Private mode: it asks again next visit.
    }
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("replace_stay_preferences", {
      p_booking_id: bookingId,
      p_prefs: prefs,
    });
    setSaving(false);
    if (error) return toast.error("Could not save your wishes", { description: error.message });
    toast.success("Thank you — the kitchen and the desk have your wishes");
    close();
    await refetch();
  };

  const { totals, booking } = view;
  const owed = totals.balance > 0 && !["cancelled", "rejected", "no_show"].includes(booking.status);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Before you arrive</DialogTitle>
          <DialogDescription>
            Two things, once — then the house is ready for you exactly as you like it.
          </DialogDescription>
        </DialogHeader>

        {owed && (
          <section className="flex flex-wrap items-center gap-4 rounded-xl bg-ink p-5 text-sand">
            <Wallet className="size-6 text-gold-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="label-caps text-gold-400">
                {booking.status === "pending_payment" ? "Payment pending" : "Balance due"}
              </p>
              <p className="font-display text-2xl text-white tabular-nums">{money(totals.balance)}</p>
              <p className="text-xs text-sand/70">
                {money(totals.paid)} of {money(totals.total)} received
              </p>
            </div>
            <Button
              asChild
              className="bg-gold/20 text-gold-200 ring-1 ring-gold/40 hover:bg-gold/30 hover:text-white"
            >
              <Link to="/guest/payment" onClick={close}>
                Pay now
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </section>
        )}

        <section aria-labelledby="fw-title" className="space-y-4">
          <h3 id="fw-title" className="font-display text-xl text-ink">
            Food &amp; wishes
          </h3>
          <FoodWishesForm value={prefs} onChange={setPrefs} settings={settings} />
        </section>

        <div className="flex flex-wrap justify-end gap-2 border-t border-ink/8 pt-4">
          <Button variant="outline" onClick={close}>
            Later
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Save my wishes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
