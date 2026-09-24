/**
 * Guest notifications — email now, WhatsApp when the templates are approved.
 *
 * Two deliberate choices:
 *
 * 1. **Providers are optional.** With no RESEND_API_KEY set this reports
 *    `delivered: false, reason: "no email provider configured"` and returns 200.
 *    A missing provider is a deployment state, not an error, and it must never
 *    turn a successful payment approval into a failed request.
 *
 * 2. **The caller's JWT is used, never service-role.** Composing a message
 *    means reading the booking and the guest, and that read should be subject
 *    to the same RLS as everything else.
 *
 * WhatsApp is stubbed rather than faked: the Business Cloud API needs templates
 * approved ahead of time, which is a lead-time task, not an engineering one.
 */
import { callerClient, corsHeaders, fail, json } from "../_shared/cors.ts";

type Kind =
  | "payment_approved"
  | "payment_rejected"
  | "booking_confirmed"
  | "invoice_ready"
  | "booking_voucher";

const SUBJECTS: Record<Kind, string> = {
  payment_approved: "Your payment is confirmed",
  payment_rejected: "We could not accept your payment receipt",
  booking_confirmed: "Your stay at Homes of Sanctuary is confirmed",
  invoice_ready: "Your invoice from Homes of Sanctuary",
  booking_voucher: "Your booking confirmation voucher — Homes of Sanctuary",
};

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function compose(kind: Kind, ctx: Record<string, string | number>) {
  const greeting = `Dear ${ctx.guestName},`;
  const sign = "\n\nWarm regards,\nHomes of Sanctuary\nNandi Hills, Karnataka";

  switch (kind) {
    case "payment_approved":
      return `${greeting}\n\nWe have received and confirmed your payment of ${rupees(Number(ctx.amount))} for booking ${ctx.reference}.\n\nYour stay at ${ctx.villa} from ${ctx.checkIn} to ${ctx.checkOut} is confirmed. The balance outstanding is ${rupees(Number(ctx.balance))}.${sign}`;
    case "payment_rejected":
      return `${greeting}\n\nWe were unable to accept the receipt you uploaded for booking ${ctx.reference}.\n\nReason: ${ctx.reason}\n\nPlease upload a corrected receipt from your guest portal and we will confirm it as soon as it arrives.${sign}`;
    case "booking_confirmed":
      return `${greeting}\n\nYour booking ${ctx.reference} at ${ctx.villa} is confirmed for ${ctx.checkIn} to ${ctx.checkOut}.\n\nCheck-in is from ${ctx.checkInTime}. We will send directions closer to the date.${sign}`;
    case "booking_voucher":
      return `${greeting}\n\nYour booking confirmation voucher for ${ctx.reference} is below — villa, dates and times, guests and payment on one page. Please carry it, or the reference, when you arrive.${sign}`;
    case "invoice_ready":
      return `${greeting}\n\nYour invoice for booking ${ctx.reference} is ready and can be viewed in your guest portal.\n\nTotal ${rupees(Number(ctx.total))}, of which ${rupees(Number(ctx.paid))} has been received.${sign}`;
  }
}


const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const FOREST = "#1f4a36";

/**
 * The voucher as email HTML — inline styles and tables only, because mail
 * clients strip everything else. Mirrors VoucherDocument in the app; every
 * value is escaped since guest names and admin text are user-supplied.
 */
function voucherHtml(v: {
  guest: Record<string, string>;
  villa: string;
  rooms: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  guests: string;
  amountLabel: string;
  amount: string;
  meals: string;
  breakfast: string;
  status: string;
  reference: string;
  important: string[];
  settings: Record<string, string>;
}) {
  const row = (label: string, value: string, extra = "") =>
    `<tr><td style="background:${FOREST};color:#faf7f3;padding:12px 14px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;width:42%;border-bottom:1px solid #faf7f3">${esc(label)}</td>` +
    `<td style="background:#fff;padding:12px 14px;font-size:14px;font-weight:600;border-bottom:1px solid #eee">${esc(value)}` +
    (extra ? ` <span style="font-weight:400;font-size:12px;color:#6b6259;margin-left:8px">${esc(extra)}</span>` : "") +
    `</td></tr>`;
  const s = v.settings;
  const brand = esc(s.trading_name ?? "Homes of Sanctuary");
  return `<!doctype html><html><body style="margin:0;background:#f2ede6;font-family:Georgia,'Times New Roman',serif;color:#142731">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#faf7f3;padding:28px">
<tr><td align="center">
  <div style="font-size:22px;letter-spacing:.08em">${brand}</div>
  <div style="font-size:13px;color:#8a6d2f;margin-top:6px">at ${esc(s.address_line1)}</div>
  <h1 style="font-size:22px;letter-spacing:.06em;text-transform:uppercase;color:${FOREST};margin:18px 0 6px">Booking confirmation voucher</h1>
  <p style="font-size:13px;line-height:1.6;color:#6b6259;margin:0 0 4px">Thank you for choosing ${brand}. We are delighted to confirm your booking details as below.</p>
  <p style="font-size:12px;color:#6b6259;margin:0 0 18px">Reference ${esc(v.reference)}</p>
</td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;border-collapse:collapse">
  ${row("Guest name", v.guest.name ?? "")}
  ${row("Phone number", v.guest.phone ?? "—")}
  ${row("Villa", v.villa, v.rooms)}
  ${row("Check-in", v.checkIn, v.checkInTime)}
  ${row("Check-out", v.checkOut, v.checkOutTime)}
  ${row("Number of guests", v.guests)}
  ${row(v.amountLabel, v.amount)}
  ${row("Meals", v.meals)}
  ${row("Breakfast", v.breakfast)}
  ${row("Booking status", v.status.toUpperCase())}
</table></td></tr>
<tr><td style="padding-top:18px;font-family:Arial,sans-serif;font-size:12px;line-height:1.7">
  <strong style="color:#8a6d2f;text-transform:uppercase;letter-spacing:.06em">Important information</strong>
  <ul style="margin:6px 0 0;padding-left:18px">
    <li>Standard check-in ${esc(v.checkInTime)}, check-out ${esc(v.checkOutTime)}</li>
    ${v.important.map((l) => `<li>${esc(l)}</li>`).join("")}
  </ul>
</td></tr>
<tr><td align="center" style="padding-top:18px;font-style:italic;color:${FOREST};font-size:15px">We look forward to hosting you for a peaceful and memorable stay.</td></tr>
<tr><td align="center" style="padding-top:18px;font-family:Arial,sans-serif;font-size:11px;color:#6b6259">
  ${[s.city, s.state, s.contact_phone, s.website, s.instagram].filter(Boolean).map(esc).join(" · ")}
</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * Send over plain SMTP.
 *
 * Supabase has no API for sending arbitrary mail — its own sender only ever
 * handles auth messages (confirm, invite, recover). So a booking or invoice
 * email needs a provider of its own, and SMTP means that can be the same Gmail
 * or hosting mailbox the property already uses, with no new account.
 */
async function sendViaSmtp(to: string, subject: string, body: string, html?: string) {
  const host = Deno.env.get("SMTP_HOST");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  if (!host || !user || !pass) return null;

  const port = Number(Deno.env.get("SMTP_PORT") ?? 465);
  const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
  const client = new SMTPClient({
    connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } },
  });

  try {
    await client.send({
      from: Deno.env.get("NOTIFY_FROM") ?? user,
      to,
      subject,
      content: body,
      ...(html ? { html } : {}),
    });
    return { delivered: true };
  } catch (error) {
    return { delivered: false, reason: `SMTP refused the message: ${error}` };
  } finally {
    await client.close().catch(() => {});
  }
}

async function sendEmail(to: string, subject: string, body: string, html?: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    // No Resend key: fall back to SMTP if the property configured one.
    const smtp = await sendViaSmtp(to, subject, body, html);
    return smtp ?? {
      delivered: false,
      reason: "no email provider configured",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("NOTIFY_FROM") ?? "Homes of Sanctuary <stay@homesofsanctuary.com>",
      to: [to],
      subject,
      text: body,
      ...(html ? { html } : {}),
    }),
  });

  if (!response.ok) {
    return { delivered: false, reason: `email provider returned ${response.status}` };
  }
  return { delivered: true };
}

async function sendWhatsApp(phone: string, body: string) {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID");
  if (!token || !phoneId) {
    return { delivered: false, reason: "no WhatsApp provider configured" };
  }

  // Business-initiated messages must use a pre-approved template, so free text
  // is only valid inside a 24-hour customer service window. Until the templates
  // are approved this stays a plain-text send and will fail outside that window.
  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace(/[^\d]/g, ""),
      type: "text",
      text: { body },
    }),
  });

  if (!response.ok) {
    return { delivered: false, reason: `WhatsApp returned ${response.status}` };
  }
  return { delivered: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Use POST", 405);

  const supabase = await callerClient(req);
  if (!supabase) return fail("Sign in first", 401);

  let body: { bookingId?: string; kind?: Kind; reason?: string; channels?: string[] };
  try {
    body = await req.json();
  } catch {
    return fail("Body must be JSON");
  }

  const { bookingId, kind, reason } = body;
  if (!bookingId) return fail("bookingId is required");
  if (!kind || !(kind in SUBJECTS)) {
    return fail(`kind must be one of: ${Object.keys(SUBJECTS).join(", ")}`);
  }
  const channels = body.channels?.length ? body.channels : ["email"];

  // Read through the caller's client: RLS decides whether they may see this.
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "reference, check_in, check_out, amount_paid, adults, children, status, " +
        "booking_mode, check_in_time, check_out_time, " +
        "customers(name, email, phone), villas(name, check_in_time, check_out_time)",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error) return fail(error.message, 400);
  if (!booking) return fail("No such booking, or it is not yours to see", 404);

  // booking_totals is a view with no foreign key, so PostgREST cannot embed it
  // in the query above — it is fetched separately rather than duplicating the
  // money maths here, where it would inevitably drift from the view.
  const { data: totals } = await supabase
    .from("booking_totals")
    .select("total, paid, balance")
    .eq("booking_id", bookingId)
    .maybeSingle();

  const guest = (booking.customers ?? {}) as Record<string, string>;
  const villa = (booking.villas ?? {}) as Record<string, string>;
  if (!guest.email && channels.includes("email")) {
    return fail("That guest has no email address on file", 422);
  }

  const message = compose(kind, {
    guestName: guest.name ?? "guest",
    reference: booking.reference,
    villa: villa.name ?? "your villa",
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    checkInTime: villa.check_in_time ?? "14:00",
    amount: booking.amount_paid ?? 0,
    balance: totals?.balance ?? 0,
    total: totals?.total ?? 0,
    paid: totals?.paid ?? 0,
    reason: reason ?? "the amount did not match",
  });

  let html: string | undefined;
  if (kind === "booking_voucher") {
    const [{ data: settings }, { data: prefs }] = await Promise.all([
      supabase.from("property_settings").select("*").maybeSingle(),
      supabase.from("stay_preferences").select("meals").eq("booking_id", bookingId).maybeSingle(),
    ]);
    const b = booking as unknown as Record<string, string | number>;
    const cfg = (settings ?? {}) as Record<string, string>;
    const fmt = (d: string) =>
      new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const adults = Number(b.adults ?? 1);
    const children = Number(b.children ?? 0);
    const pickedMeals = (prefs?.meals ?? []) as string[];
    const settled = Number(totals?.balance ?? 0) <= 0;
    html = voucherHtml({
      guest,
      villa: villa.name ?? "",
      rooms: b.booking_mode === "whole" ? "Whole villa" : "",
      checkIn: fmt(String(booking.check_in)),
      checkOut: fmt(String(booking.check_out)),
      checkInTime: String(b.check_in_time || villa.check_in_time || "14:00"),
      checkOutTime: String(b.check_out_time || villa.check_out_time || "11:00"),
      guests:
        `${adults} ${adults === 1 ? "Adult" : "Adults"}` +
        (children ? ` + ${children} ${children === 1 ? "Child" : "Children"}` : ""),
      amountLabel: settled ? "Total amount paid" : "Total amount",
      amount: rupees(Number(settled ? totals?.paid : totals?.total) || 0),
      meals: pickedMeals.length ? pickedMeals.map((m) => m.replace(/_/g, " ")).join(", ") : "À la carte — not included",
      breakfast: cfg.breakfast_line || "—",
      status: String(b.status ?? "").replace(/_/g, " "),
      reference: booking.reference,
      important: (cfg.important_info ?? "").split("\n").map((l) => l.trim()).filter(Boolean),
      settings: cfg,
    });
  }


  const results: Record<string, unknown> = {};
  if (channels.includes("email")) {
    results.email = await sendEmail(guest.email, SUBJECTS[kind], message, html);
  }
  if (channels.includes("whatsapp")) {
    results.whatsapp = await sendWhatsApp(guest.phone ?? "", message);
  }

  // 200 even when nothing was delivered: the caller asked us to try, and an
  // unconfigured provider is not their failure to handle.
  return json({ ok: true, kind, reference: booking.reference, results });
});
