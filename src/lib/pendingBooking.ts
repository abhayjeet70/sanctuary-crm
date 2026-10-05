import { supabase } from "@/services/supabase/client";
import type { StayPreferencesDraft } from "@/types";

/**
 * A booking the guest has finished describing but not yet been able to submit.
 *
 * The wizard collects everything before there is an account, and `request_booking`
 * needs a session. If sign-up has to wait for an email confirmation there is no
 * session to submit with, so the answers are kept here and sent the first time
 * the guest lands signed in — nothing they chose is lost between the two.
 */
export interface BookingDraft {
  villaId?: string;
  roomIds: string[];
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  arrival: string;
  departure: string;
  prefs: StayPreferencesDraft;
  requests: string;
  phone: string;
  country: string;
  /** Set when the dates were sold and the guest is queueing instead. */
  waitlist?: { villaId?: string; villaName?: string };
}

const KEY = "hos.pendingBooking";

export const saveDraft = (draft: BookingDraft) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private window — the wizard still works, it just cannot survive a reload.
  }
};

export const loadDraft = (): BookingDraft | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BookingDraft) : null;
  } catch {
    return null;
  }
};

/**
 * The draft from this device, else the copy signup stored on the account —
 * which is what survives opening the confirmation email on a phone.
 */
export async function loadAnyDraft(): Promise<BookingDraft | null> {
  const local = loadDraft();
  if (local) return local;
  const { data } = await supabase.auth.getUser();
  return (data.user?.user_metadata?.pending_booking as BookingDraft | undefined) ?? null;
}

export const clearDraft = async () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
  // Signed in by the time this runs; without a session it is a harmless no-op.
  await supabase.auth.updateUser({ data: { pending_booking: null } });
};

/** Send a draft to the database as the signed-in guest. */
export async function submitDraft(
  draft: BookingDraft,
): Promise<{ error: string | null; waitlisted: boolean }> {
  const prefs = { ...draft.prefs, specialRequests: draft.requests.trim() };
  let customerId: string | undefined;

  if (draft.waitlist) {
    const { data, error } = await supabase.rpc("join_waitlist", {
      p_villa_id: draft.waitlist.villaId ?? null,
      p_check_in: draft.checkIn,
      p_check_out: draft.checkOut,
      p_adults: draft.adults || 1,
      p_children: draft.children || 0,
      p_source: "website",
      p_note: draft.requests.trim(),
      p_room_ids: draft.roomIds,
      p_check_in_time: draft.arrival || null,
      p_check_out_time: draft.departure || null,
      p_prefs: prefs,
      p_customer_id: null,
    });
    if (error) return { error: error.message, waitlisted: true };
    customerId = (data as { customer_id?: string } | null)?.customer_id;
  } else {
    const { data, error } = await supabase.rpc("request_booking", {
      p_villa_id: draft.villaId,
      p_room_ids: draft.roomIds,
      p_check_in: draft.checkIn,
      p_check_out: draft.checkOut,
      p_adults: draft.adults,
      p_children: draft.children,
      p_special_requests: draft.requests.trim() || null,
      p_check_in_time: draft.arrival || null,
      p_check_out_time: draft.departure || null,
      p_prefs: prefs,
    });
    if (error) return { error: error.message, waitlisted: false };
    customerId = (data as { customer_id?: string } | null)?.customer_id;
  }

  // Signup takes no phone or country; fill them in on the customer row. Not
  // fatal — the booking already went through.
  if (customerId && draft.phone) {
    await supabase
      .from("customers")
      .update({ phone: draft.phone, country: draft.country || "India" })
      .eq("id", customerId);
  }
  return { error: null, waitlisted: Boolean(draft.waitlist) };
}
