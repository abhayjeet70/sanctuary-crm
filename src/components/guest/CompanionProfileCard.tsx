import { useState } from "react";
import { toast } from "sonner";
import { Eyebrow } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmailInput } from "@/components/common/EmailInput";
import { emailProblem } from "@/lib/email";
import { Label } from "@/components/ui/label";
import { supabase } from "@/services/supabase/client";
import { useMockData } from "@/hooks/useData";
import { useSession } from "@/services/session";

/**
 * A companion signs in on a login the booking holder generated and shared, so
 * at first they are nobody in particular. This is where they say who they are —
 * name and, if they like, a phone and email — so the kitchen and the desk know
 * whose dinner and whose towels these are. It only ever touches their own row.
 */
export function CompanionProfileCard() {
  const { session } = useSession();
  const { companions } = useMockData();
  const me = companions.find((c) => c.id === session?.companionId);

  const placeholder = !me || /^guest of /i.test(me.fullName);
  const [name, setName] = useState(placeholder ? "" : (me?.fullName ?? ""));
  const [phone, setPhone] = useState(me?.phone ?? "");
  const [email, setEmail] = useState(me?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (name.trim().length < 2) return toast.error("Tell us your name");
    const emailIssue = emailProblem(email, { required: false });
    if (emailIssue) return toast.error(emailIssue);
    setSaving(true);
    const { error } = await supabase.rpc("update_companion_details", {
      p_full_name: name.trim(),
      p_phone: phone.trim(),
      p_email: email.trim(),
    });
    setSaving(false);
    if (error) return toast.error("Could not save", { description: error.message });
    toast.success("Thank you — the team knows who you are now");
    window.location.reload();
  };

  return (
    <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.07]">
      <Eyebrow className="text-gold-700">
        {placeholder ? "Tell us who you are" : "Your details"}
      </Eyebrow>
      <p className="mt-2 text-sm text-stone-600">
        You are signed in on a shared guest login. Add your name so your orders and requests
        are yours.
      </p>
      <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={save} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="cp-name">Your name</Label>
          <Input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cp-phone">Phone (optional)</Label>
          <Input id="cp-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cp-email">Email (optional)</Label>
          <EmailInput id="cp-email" required={false} showError={tried} value={email} onChange={setEmail} />
        </div>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save my details"}
          </Button>
        </div>
      </form>
    </section>
  );
}
