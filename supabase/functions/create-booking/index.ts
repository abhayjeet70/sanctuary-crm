/**
 * Create a booking taken over the phone, WhatsApp, Goibibo or at the door.
 *
 * The conflict check that matters is the exclusion constraint inside
 * `create_booking`. This function's job is to turn the resulting Postgres error
 * into something the reception desk can act on — including listing what is
 * actually in the way, which a raw 23P01 does not tell you.
 */
import { callerClient, corsHeaders, fail, json } from "../_shared/cors.ts";

interface Payload {
  customerId?: string;
  villaId?: string;
  roomIds?: string[];
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  children?: number;
  source?: string;
  nightlyRate?: number;
  discount?: number;
  taxRate?: number;
  advance?: number;
  specialRequests?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Use POST", 405);

  const supabase = await callerClient(req);
  if (!supabase) return fail("Sign in first", 401);

  let p: Payload;
  try {
    p = await req.json();
  } catch {
    return fail("Body must be JSON");
  }

  const missing = (["customerId", "villaId", "checkIn", "checkOut"] as const).filter(
    (key) => !p[key],
  );
  if (missing.length) return fail(`Missing: ${missing.join(", ")}`);
  if (!ISO_DATE.test(p.checkIn!) || !ISO_DATE.test(p.checkOut!)) {
    return fail("Dates must be YYYY-MM-DD");
  }
  if (p.checkOut! <= p.checkIn!) return fail("Check-out must be after check-in");

  // Cheap pre-flight so the desk sees which booking is in the way, rather than
  // a bare constraint violation. The constraint is still the real guard.
  const { data: clashes } = await supabase.rpc("find_booking_conflicts", {
    p_villa_id: p.villaId,
    p_room_ids: p.roomIds ?? [],
    p_check_in: p.checkIn,
    p_check_out: p.checkOut,
    p_ignore_id: null,
  });

  if (Array.isArray(clashes) && clashes.length > 0) {
    return json(
      {
        error: "Those dates are already held",
        conflicts: clashes.map((c: Record<string, unknown>) => ({
          reference: c.reference,
          checkIn: c.check_in,
          checkOut: c.check_out,
          wholeVilla: c.whole_villa,
        })),
      },
      409,
    );
  }

  const { data, error } = await supabase.rpc("create_booking", {
    p_customer_id: p.customerId,
    p_villa_id: p.villaId,
    p_room_ids: p.roomIds ?? [],
    p_check_in: p.checkIn,
    p_check_out: p.checkOut,
    p_adults: p.adults ?? 2,
    p_children: p.children ?? 0,
    p_source: p.source ?? "phone",
    p_nightly_rate: p.nightlyRate ?? 0,
    p_discount: p.discount ?? 0,
    p_tax_rate: p.taxRate ?? 0.18,
    p_advance: p.advance ?? 0,
    p_special_requests: p.specialRequests ?? null,
  });

  if (error) {
    // 23P01 means someone else took the dates between the check above and the
    // insert. That is exactly the race the constraint exists to lose safely.
    const status = error.code === "23P01" ? 409 : error.code === "42501" ? 403 : 400;
    return fail(error.message, status);
  }

  return json({ ok: true, booking: data }, 201);
});
