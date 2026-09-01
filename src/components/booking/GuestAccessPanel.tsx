import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Mail, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/common";
import { supabase } from "@/services/supabase/client";

interface InviteResult {
  email: string;
  sent?: boolean;
  sendError?: string | null;
  isNewAccount: boolean;
  actionLink: string;
  message: string;
  whatsappUrl: string | null;
}

/**
 * Gives the guest a way into their booking.
 *
 * Reception takes a booking over the phone; the guest then has no account and
 * no reason to know they should make one. This produces a link that signs them
 * in and lets them set a password.
 *
 * The link is shown rather than only emailed, because email delivery needs SMTP
 * configured and this property already talks to its guests on WhatsApp. A link
 * you can paste works today; one that silently fails to send does not.
 */
export function GuestAccessPanel({
  bookingId,
  guestEmail,
}: {
  bookingId: string;
  guestEmail?: string;
}) {
  const [result, setResult] = useState<InviteResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"link" | "message" | null>(null);

  /**
   * `send` asks Supabase to email the invite itself. Its built-in sender covers
   * auth mail with no provider to configure — the only email this app can
   * deliver unaided. The link comes back either way, so a send that silently
   * fails still leaves the desk something to paste.
   */
  const invite = async (send: boolean) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke<InviteResult>("invite-guest", {
      body: { bookingId, redirectTo: `${window.location.origin}/guest/dashboard`, send },
    });
    setBusy(false);

    if (error || !data?.actionLink) {
      toast.error("Could not create the guest link", {
        description: error?.message ?? "The guest may have no email address on file.",
      });
      return;
    }
    setResult(data);

    if (send && data.sent) {
      toast.success(`Invite emailed to ${data.email}`, {
        description: "Supabase sent it. Ask them to check spam if it has not arrived.",
      });
    } else if (send) {
      toast.warning("Supabase would not send it", {
        description: data.sendError ?? "Send the link below instead.",
      });
    } else {
      toast.success(
        data.isNewAccount ? "Guest account created" : "Sign-in link created",
        { description: data.email },
      );
    }
  };

  const copy = async (text: string, which: "link" | "message") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
      toast.success(which === "link" ? "Link copied" : "Message copied");
    } catch {
      toast.error("Could not copy — select the text and copy it manually");
    }
  };

  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
      <Eyebrow className="text-gold-700">Guest portal access</Eyebrow>

      {!result ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            {guestEmail
              ? "Create a sign-in link so this guest can see their booking, view the invoice and upload a payment receipt."
              : "This guest has no email address on file. Add one before creating portal access."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void invite(true)} disabled={busy || !guestEmail}>
              <Mail aria-hidden />
              {busy ? "Sending…" : "Email the invite"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void invite(false)}
              disabled={busy || !guestEmail}
            >
              <KeyRound aria-hidden />
              Just give me a link
            </Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-stone-600">
            Invites go through Supabase, so they send with no provider set up. Its
            built-in sender is capped at a couple an hour and, until custom SMTP is
            configured, only reaches addresses on the project team — the link always
            works.
          </p>
        </>
      ) : (
        <>
          {result.sent && (
            <p className="mt-3 rounded-lg bg-status-confirmed-bg p-3 text-sm text-ink">
              Invite emailed to {result.email}. The link below is the same one, in case
              it does not arrive.
            </p>
          )}
          <p className="mt-3 text-sm text-stone-600">
            {result.isNewAccount
              ? "Account created for "
              : "This guest already had an account. New sign-in link for "}
            <span className="font-medium text-ink">{result.email}</span>. Send them the
            link — it signs them in and lets them set a password.
          </p>

          <div className="mt-4 rounded-lg bg-sand-200/60 p-3">
            <p className="break-all font-mono text-xs text-ink">{result.actionLink}</p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void copy(result.actionLink, "link")}>
              {copied === "link" ? <Check aria-hidden /> : <Copy aria-hidden />}
              Copy link
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copy(result.message, "message")}
            >
              {copied === "message" ? <Check aria-hidden /> : <Copy aria-hidden />}
              Copy full message
            </Button>
            {result.whatsappUrl && (
              <Button size="sm" asChild>
                <a href={result.whatsappUrl} target="_blank" rel="noreferrer">
                  <MessageCircle aria-hidden />
                  Send on WhatsApp
                </a>
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
              Done
            </Button>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-stone-600">
            Treat the link like a password — anyone holding it can open this booking.
            It expires, and creating a new one invalidates the old.
          </p>
        </>
      )}
    </section>
  );
}

/** Emails a guest about their booking through the `send-notification` function. */
export function EmailGuestButton({
  bookingId,
  kind,
  label,
}: {
  bookingId: string;
  kind: "payment_approved" | "booking_confirmed" | "invoice_ready";
  label: string;
}) {
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("send-notification", {
      body: { bookingId, kind },
    });
    setBusy(false);

    if (error) {
      toast.error("Could not send", { description: error.message });
      return;
    }

    // The function reports honestly when no provider is configured, and that is
    // shown as-is rather than pretending an email went out.
    const email = (data as { results?: { email?: { delivered: boolean; reason?: string } } })
      ?.results?.email;

    if (email?.delivered) {
      toast.success("Email sent to the guest");
    } else {
      toast.warning("Nothing was sent", {
        description:
          email?.reason === "no email provider configured"
            ? "Run: npm run configure-email to set this up."
            : (email?.reason ?? "The provider rejected the message."),
      });
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={() => void send()} disabled={busy}>
      <Send aria-hidden />
      {busy ? "Sending…" : label}
    </Button>
  );
}
