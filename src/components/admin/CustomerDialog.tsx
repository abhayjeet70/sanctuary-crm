import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileCheck2, Loader2, ShieldCheck, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useCustomers, useMockData } from "@/hooks/useData";
import { cleanPhone, isPhone } from "@/lib/format";
import { resolveGuestIdUrl, uploadGuestId } from "@/services/supabase/receipts";
import type { Customer, GovtIdType } from "@/types";

const NO_ID = "none";

/** What reception is actually handed across the desk. */
const ID_TYPES: { value: GovtIdType; label: string }[] = [
  { value: "aadhaar", label: "Aadhaar" },
  { value: "passport", label: "Passport" },
  { value: "driving_licence", label: "Driving licence" },
  { value: "voter_id", label: "Voter ID" },
  { value: "pan", label: "PAN" },
  { value: "other", label: "Other" },
];

/**
 * Add a guest, or edit one.
 *
 * A booking taken over the phone can create its guest inline, but reception
 * also needs to record someone who has only enquired — and to fix a number
 * that was taken down wrong. That is what this is for.
 */
export function CustomerDialog({
  customer,
  onClose,
}: {
  /** Null when adding. */
  customer: Customer | null;
  onClose: () => void;
}) {
  const { saveCustomer } = useMockData();
  const customers = useCustomers();

  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [city, setCity] = useState(customer?.city ?? "");
  const [preferences, setPreferences] = useState((customer?.preferences ?? []).join(", "));
  const [notes, setNotes] = useState(customer?.notes ?? "");

  const [idType, setIdType] = useState<string>(customer?.idType ?? NO_ID);
  const [idNumber, setIdNumber] = useState(customer?.idNumber ?? "");
  const [idImagePath, setIdImagePath] = useState(customer?.idImagePath ?? "");
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // A new guest has no id to key the scan on, so one is minted for the folder.
  // The bucket is management-only in both directions, so that first path
  // segment carries no authorisation meaning — it only keeps files apart.
  const folder = useRef(customer?.id ?? crypto.randomUUID());

  // The bucket is private: a stored path needs signing before it can be shown.
  useEffect(() => {
    let active = true;
    if (!idImagePath) {
      setIdPreview(null);
      return;
    }
    void resolveGuestIdUrl(idImagePath).then((url) => {
      if (active) setIdPreview(url);
    });
    return () => {
      active = false;
    };
  }, [idImagePath]);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const { path, error } = await uploadGuestId(folder.current, file);
    setUploading(false);
    if (error || !path) {
      return toast.error("Could not upload that", { description: error ?? undefined });
    }
    setIdImagePath(path);
    toast.success("ID photo attached");
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return toast.error("Enter the guest's name");
    if (phone.trim() && !isPhone(phone)) {
      return toast.error("That is not a phone number we could ring");
    }
    if (!phone.trim() && !email.trim()) {
      return toast.error("A phone number or an email address is needed", {
        description: "Without one of them there is no way to reach this guest.",
      });
    }

    // A guest's account is linked to their record by matching email, so a
    // duplicate address would attach one login to two people.
    const clash = customers.find(
      (c) =>
        c.id !== customer?.id &&
        email.trim() !== "" &&
        c.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (clash) {
      return toast.error(`${clash.name} already uses that email address`, {
        description: "Open their record instead of creating a second one.",
      });
    }

    saveCustomer({
      id: customer?.id,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      city: city.trim(),
      preferences: preferences
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
      notes: notes.trim() || undefined,
      idType: idType === NO_ID ? undefined : (idType as GovtIdType),
      idNumber: idNumber.trim() || undefined,
      idImagePath: idImagePath || undefined,
    });
    toast.success(customer ? `${name.trim()} updated` : `${name.trim()} added`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Two columns and real padding. At the primitive's default `max-w-sm`
          every field was full width in a 384px well, which turned a nine-field
          form into a scrolling column — the same information, three times the
          height, and a scrollbar down the middle of it. */}
      <DialogContent className="scrollbar-slim max-h-[90vh] overflow-y-auto p-6 sm:max-w-2xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{customer ? `Edit ${customer.name}` : "Add a guest"}</DialogTitle>
            <DialogDescription>
              Enough to reach them and to recognise them next time. Bookings, payments
              and feedback attach themselves to this record.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-6">
            <Section title="Who they are">
              <div className="sm:col-span-2">
                <Field label="Name" htmlFor="guest-name">
                  <Input
                    id="guest-name"
                    required
                    autoComplete="off"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Pooja Bothra"
                  />
                </Field>
              </div>
              <Field label="Phone" htmlFor="guest-phone">
                <Input
                  id="guest-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(cleanPhone(event.target.value))}
                  placeholder="+91 98450 12345"
                />
              </Field>
              <Field label="Email" htmlFor="guest-email">
                <Input
                  id="guest-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </Field>
              <Field label="City" htmlFor="guest-city">
                <Input
                  id="guest-city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="Bengaluru"
                />
              </Field>
              <Field
                label="Preferences"
                htmlFor="guest-preferences"
                hint="Separate them with commas."
              >
                <Input
                  id="guest-preferences"
                  value={preferences}
                  onChange={(event) => setPreferences(event.target.value)}
                  placeholder="Vegetarian, early breakfast"
                />
              </Field>
            </Section>

            {/* --------------------------------------------------- photo ID */}
            <Section
              title="Government ID"
              icon={<ShieldCheck className="size-3.5" aria-hidden />}
              note="Taken at check-in. The scan is held in a private store and never becomes a link — only management can open it."
            >
              <Field label="Type" htmlFor="guest-id-type">
                <Select value={idType} onValueChange={setIdType}>
                  <SelectTrigger id="guest-id-type" className="w-full">
                    <SelectValue placeholder="Not recorded" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ID}>Not recorded</SelectItem>
                    {ID_TYPES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Number" htmlFor="guest-id-number">
                <Input
                  id="guest-id-number"
                  value={idNumber}
                  autoComplete="off"
                  onChange={(event) => setIdNumber(event.target.value)}
                  placeholder="As printed on the document"
                  disabled={idType === NO_ID}
                />
              </Field>

              <div className="sm:col-span-2">
                <Field
                  label="Photograph of the ID"
                  htmlFor="guest-id-file"
                  hint="JPG, PNG, WebP or PDF, up to 5 MB."
                >
                  <input
                    ref={fileInput}
                    id="guest-id-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="sr-only"
                    onChange={(event) => {
                      void pickFile(event.target.files?.[0]);
                      // Cleared so re-picking the same file still fires a change.
                      event.target.value = "";
                    }}
                  />

                  {idImagePath ? (
                    <div className="flex items-center gap-3 rounded-lg bg-sand-200/60 p-2.5 ring-1 ring-gold/15">
                      {idPreview && !idPreview.includes(".pdf") ? (
                        <img
                          src={idPreview}
                          alt={`ID document on file for ${name || "this guest"}`}
                          className="size-12 shrink-0 rounded-md object-cover ring-1 ring-gold/20"
                        />
                      ) : (
                        <FileCheck2
                          className="size-5 shrink-0 text-status-confirmed"
                          aria-hidden
                        />
                      )}
                      <p className="min-w-0 flex-1 text-sm text-ink">
                        Attached
                        <span className="block truncate text-xs text-stone-600">
                          {idImagePath.split("/").pop()}
                        </span>
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIdImagePath("")}
                      >
                        <X aria-hidden />
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={uploading}
                      onClick={() => fileInput.current?.click()}
                    >
                      {uploading ? (
                        <Loader2 className="animate-spin" aria-hidden />
                      ) : (
                        <Upload aria-hidden />
                      )}
                      {uploading ? "Uploading…" : "Attach a photo or scan"}
                    </Button>
                  )}
                </Field>
              </div>
            </Section>

            <div className="space-y-1.5">
              <Label htmlFor="guest-notes">Internal notes</Label>
              <Textarea
                id="guest-notes"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Anything the team should know before they arrive."
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{customer ? "Save" : "Add guest"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  icon,
  note,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="label-caps flex items-center gap-2 text-gold-700">
        {icon}
        {title}
      </p>
      <hr className="rule-gold mt-2 mb-3" />
      {note && <p className="mb-4 text-xs leading-relaxed text-stone-600">{note}</p>}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-stone-600">{hint}</p>}
    </div>
  );
}
