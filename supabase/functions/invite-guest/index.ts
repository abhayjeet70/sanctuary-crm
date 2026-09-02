/**
 * Give a guest access to their booking.
 *
 * The gap this closes: reception takes a booking over the phone, and the guest
 * has no way in. Expecting them to guess that they should self-register with
 * exactly the address reception typed is not a workflow.
 *
 * What this does instead: creates their account and returns a one-time link
 * that confirms them and lets them set a password. The admin sends that link
 * however they already talk to the guest — WhatsApp, usually.
 *
 * ── On the service-role key ──────────────────────────────────────────────
 * This is the ONE function that uses it, because creating an auth user is an
 * admin operation the anon key cannot perform. That makes it the most
 * dangerous endpoint in the system, so before the privileged client is touched
 * the CALLER is checked with their own JWT: they must be an admin, and the
 * booking must exist. The service-role client is never used to decide who is
 * allowed to do what — only to carry out what has already been authorised.
 */
import { callerClient, corsHeaders, fail, json } from "../_shared/cors.ts";

const rupees = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Use POST", 405);

  const supabase = await callerClient(req);
  if (!supabase) return fail("Sign in first", 401);

  let body: {
    bookingId?: string;
    /** A guest with no booking yet — an enquiry reception has recorded. */
    customerId?: string;
    redirectTo?: string;
    send?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return fail("Body must be JSON");
  }
  if (!body.bookingId && !body.customerId) {
    return fail("bookingId or customerId is required");
  }

  // ---- Authorise the caller, using THEIR permissions, before going near the
  // service-role key.
  const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin");
  if (roleError) return fail(roleError.message, 400);
  if (!isAdmin) return fail("Only staff can give a guest portal access", 403);

  // Either route ends with a customer and, when there is one, their stay.
  let booking: Record<string, unknown> | null = null;
  let guest: Record<string, string> = {};
  let customerId: string | undefined = body.customerId;

  if (body.bookingId) {
    const { data, error: readError } = await supabase
      .from("bookings")
      .select("id, reference, check_in, check_out, customer_id, customers(name, email, phone), villas(name, check_in_time)")
      .eq("id", body.bookingId)
      .maybeSingle();

    if (readError) return fail(readError.message, 400);
    if (!data) return fail("Booking not found", 404);
    booking = data as Record<string, unknown>;
    guest = (data.customers ?? {}) as Record<string, string>;
    customerId = data.customer_id as string;
  } else {
    const { data, error: readError } = await supabase
      .from("customers")
      .select("id, name, email, phone")
      .eq("id", body.customerId)
      .maybeSingle();

    if (readError) return fail(readError.message, 400);
    if (!data) return fail("Guest not found", 404);
    guest = data as unknown as Record<string, string>;
  }

  const villa = ((booking?.villas as Record<string, string>) ?? {}) as Record<string, string>;
  const email = guest.email?.trim().toLowerCase();
  if (!email) return fail("That guest has no email address on file", 422);

  const { data: totals } = booking
    ? await supabase
        .from("booking_totals")
        .select("total, balance")
        .eq("booking_id", booking.id as string)
        .maybeSingle()
    : { data: null };

  // ---- Privileged section.
  const { createClient } = await import("jsr:@supabase/supabase-js@2");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return fail("Server is missing its service role key", 500);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { persistSession: false },
  });

  const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:5173";
  const redirectTo = body.redirectTo ?? `${siteUrl}/guest/dashboard`;

  // Has this guest an account already? listUsers is paged, so filter by email.
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const already = existing?.users.find((u) => u.email?.toLowerCase() === email);

  // ---- Ask Supabase to actually send the email.
  //
  // Supabase's own sender handles auth mail — invites, magic links, recovery —
  // with no provider to configure. It will not send arbitrary messages, so this
  // is the one email the app can deliver unaided.
  //
  // Two caveats it is worth being honest about: the built-in sender is rate
  // limited to a couple an hour, and on a project without custom SMTP it only
  // delivers to addresses on the project team. Custom SMTP lifts both.
  let sent = false;
  let sendError: string | null = null;

  if (body.send) {
    if (already) {
      // An existing user cannot be invited again; a magic link is the
      // equivalent that still arrives by email.
      const { error } = await admin.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      sendError = error?.message ?? null;
    } else {
      const { error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { full_name: guest.name ?? "" },
      });
      sendError = error?.message ?? null;
    }
    sent = !sendError;
  }

  // An invite creates the user and confirms them when the link is followed. A
  // guest who already has an account gets a magic link instead — inviting them
  // again would fail, and a recovery link would imply they forgot a password
  // they may never have set.
  const linkType = already ? "magiclink" : "invite";

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: linkType as "invite" | "magiclink",
    email,
    options: { redirectTo, data: { full_name: guest.name ?? "" } },
  });

  if (linkError) return fail(linkError.message, 400);

  // The trigger on auth.users links the new profile to a customer by matching
  // email. Reception may have used a different address, so bind it explicitly.
  const userId = link.user?.id ?? already?.id;
  if (userId) {
    await admin
      .from("profiles")
      .update({ customer_id: customerId })
      .eq("id", userId)
      .eq("role", "guest");
  }

  // With no booking there is nothing to summarise, so the message is only the
  // way in — which is the whole point of inviting someone who has not booked.
  const b = (booking ?? {}) as Record<string, string>;
  const message = booking
    ? `Hello ${guest.name ?? "there"}, your stay at ${villa.name ?? "Homes of Sanctuary"} is booked.\n\n` +
      `Booking ${b.reference}\n` +
      `${b.check_in} to ${b.check_out}, check-in from ${villa.check_in_time ?? "14:00"}\n` +
      `Total ${rupees(totals?.total ?? 0)}, balance ${rupees(totals?.balance ?? 0)}\n\n` +
      `Open your booking, pay and upload your receipt here:\n${link.properties?.action_link}\n\n` +
      `The link signs you in and lets you set a password.`
    : `Hello ${guest.name ?? "there"}, here is your Homes of Sanctuary guest portal.\n\n` +
      `Open it here:\n${link.properties?.action_link}\n\n` +
      `The link signs you in and lets you set a password. Your booking will appear ` +
      `there once it is confirmed.`;

  return json({
    ok: true,
    email,
    sent,
    sendError,
    isNewAccount: !already,
    actionLink: link.properties?.action_link,
    // Ready to paste into WhatsApp, which is how this property already talks
    // to its guests. Email delivery needs SMTP configured; a link does not.
    message,
    whatsappUrl: guest.phone
      ? `https://wa.me/${String(guest.phone).replace(/\D/g, "")}?text=${encodeURIComponent(message)}`
      : null,
  });
});
