import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Building2, Palette, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eyebrow, LoadingState, PageHeader } from "@/components/common";
import { MenuManager } from "./MenuManager";
import { TaxManager } from "./TaxManager";
import { DepartmentManager } from "./DepartmentManager";
import { AccountSettings } from "./AccountSettings";
import { useMockData, useSettings, useVillas } from "@/hooks/useData";
import { useSession } from "@/services/session";
import { money } from "@/lib/format";
import type { PropertySettings } from "@/types";

/**
 * Everything about the property that the UI used to hardcode.
 *
 * The payment details in particular are read by the guest portal and printed on
 * every invoice — a change here reaches both immediately, which is the point.
 */
/** One active style for all of them, so none drifts. */
const TAB =
  "data-[state=active]:bg-ink data-[state=active]:text-sand data-[state=active]:shadow-soft rounded-lg px-3 py-1.5 text-stone-600 hover:text-ink";

export default function SettingsPage() {
  const villas = useVillas();
  const { session } = useSession();
  const settings = useSettings();
  const { updateSettings } = useMockData();

  const [draft, setDraft] = useState<PropertySettings | null>(settings);
  const [saving, setSaving] = useState(false);

  // The settings arrive after the first render, so the draft follows them —
  // but only until the user starts editing, or their typing would be undone.
  useEffect(() => {
    setDraft((current) => current ?? settings);
  }, [settings]);

  if (!settings || !draft) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Property configuration" title="Settings" />
        <LoadingState label="Loading settings" />
      </div>
    );
  }

  const set = <K extends keyof PropertySettings>(key: K, value: PropertySettings[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const save = () => {
    setSaving(true);
    updateSettings(draft);
    toast.success("Settings saved", {
      description: "Guests and invoices pick this up immediately.",
    });
    window.setTimeout(() => setSaving(false), 500);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Property configuration"
        title="Settings"
        description="Payment details, invoice identity and the kitchen menu."
        actions={
          dirty && (
            <Button onClick={save} disabled={saving}>
              <Save aria-hidden />
              {saving ? "Saving…" : "Save changes"}
            </Button>
          )
        }
      />

      <Tabs defaultValue="payment">
        <TabsList className="h-auto flex-wrap justify-start gap-1 p-1.5">
          <TabsTrigger value="payment" className={TAB}>Payment</TabsTrigger>
          <TabsTrigger value="invoice" className={TAB}>Invoice</TabsTrigger>
          <TabsTrigger value="taxes" className={TAB}>Taxes</TabsTrigger>
          <TabsTrigger value="property" className={TAB}>Property</TabsTrigger>
          <TabsTrigger value="departments" className={TAB}>Departments</TabsTrigger>
          <TabsTrigger value="menu" className={TAB}>Menu</TabsTrigger>
          <TabsTrigger value="villas" className={TAB}>Villas</TabsTrigger>
          <TabsTrigger value="account" className={TAB}>Account</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------- payment */}
        <TabsContent value="payment" className="space-y-6 pt-5">
          <Section
            title="Where guests pay"
            note="Shown on the guest payment page and printed on every invoice. Change it here and both follow."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="upi"
                label="UPI ID"
                value={draft.upiId}
                onChange={(v) => set("upiId", v)}
                placeholder="sanctuary@hdfcbank"
              />
              <Field
                id="bank"
                label="Bank"
                value={draft.bankName}
                onChange={(v) => set("bankName", v)}
                placeholder="HDFC Bank"
              />
              <Field
                id="account-name"
                label="Account name"
                value={draft.accountName}
                onChange={(v) => set("accountName", v)}
              />
              <Field
                id="account-number"
                label="Account number"
                value={draft.accountNumber}
                onChange={(v) => set("accountNumber", v)}
              />
              <Field
                id="ifsc"
                label="IFSC"
                value={draft.ifsc}
                onChange={(v) => set("ifsc", v)}
                placeholder="HDFC0001284"
              />
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="payment-note">Note to guests</Label>
              <Textarea
                id="payment-note"
                rows={2}
                value={draft.paymentNote}
                onChange={(e) => set("paymentNote", e.target.value)}
              />
            </div>

            {!draft.upiId && !draft.accountNumber && (
              <p role="alert" className="mt-4 rounded-lg bg-status-cancelled-bg p-3 text-sm text-ink">
                With neither a UPI ID nor an account number, guests are shown no way to
                pay at all.
              </p>
            )}
          </Section>
        </TabsContent>

        {/* ------------------------------------------------------- invoice */}
        <TabsContent value="invoice" className="space-y-6 pt-5">
          <Section
            title="Invoice"
            note="What appears on the document a guest receives and prints."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="legal-name"
                label="Legal name"
                value={draft.legalName}
                onChange={(v) => set("legalName", v)}
              />
              <Field
                id="gstin"
                label="GSTIN"
                value={draft.gstin}
                onChange={(v) => set("gstin", v)}
                placeholder="29ABCDE1234F1Z5"
              />
              <Field
                id="pan"
                label="PAN"
                value={draft.pan}
                onChange={(v) => set("pan", v)}
              />
              <Field
                id="invoice-prefix"
                label="Invoice number prefix"
                value={draft.invoicePrefix}
                onChange={(v) => set("invoicePrefix", v)}
                placeholder="HOS"
              />
              <Field
                id="state-code"
                label="GST state code"
                value={draft.stateCode}
                onChange={(v) => set("stateCode", v)}
                placeholder="29"
              />
              <Field
                id="hsn-code"
                label="SAC / HSN"
                value={draft.hsnCode}
                onChange={(v) => set("hsnCode", v)}
                placeholder="996311"
              />
              <Field
                id="signatory"
                label="Authorised signatory"
                value={draft.signatoryName}
                onChange={(v) => set("signatoryName", v)}
                placeholder="Anjali Rao"
              />
            </div>

            <div className="mt-4 space-y-1.5">
              <Label htmlFor="invoice-declaration">Declaration</Label>
              <Textarea
                id="invoice-declaration"
                rows={2}
                value={draft.invoiceDeclaration}
                onChange={(e) => set("invoiceDeclaration", e.target.value)}
              />
              <p className="text-xs text-stone-600">
                Printed above the signature, as a tax invoice is expected to carry.
              </p>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={draft.showGstinOnInvoice}
                onChange={(e) => set("showGstinOnInvoice", e.target.checked)}
                className="size-4 accent-[var(--color-clay)]"
              />
              Print the GSTIN on invoices
            </label>

            <div className="mt-4 space-y-1.5">
              <Label htmlFor="invoice-terms">Terms</Label>
              <Textarea
                id="invoice-terms"
                rows={3}
                value={draft.invoiceTerms}
                onChange={(e) => set("invoiceTerms", e.target.value)}
                placeholder="Cancellation policy, check-in conditions…"
              />
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="invoice-footer">Footer line</Label>
              <Input
                id="invoice-footer"
                value={draft.invoiceFooter}
                onChange={(e) => set("invoiceFooter", e.target.value)}
                placeholder="Thank you for staying with us."
              />
            </div>

            {draft.showGstinOnInvoice && !draft.gstin && (
              <p role="alert" className="mt-4 rounded-lg bg-status-pending-bg p-3 text-sm text-ink">
                GSTIN is set to print but is empty, so invoices will show a blank where a
                tax number should be.
              </p>
            )}
          </Section>
        </TabsContent>

        {/* --------------------------------------------------------- taxes */}
        <TabsContent value="taxes" className="pt-5">
          <TaxManager />
        </TabsContent>

        {/* ------------------------------------------------------ property */}
        <TabsContent value="property" className="space-y-6 pt-5">
          <Section title="The property" note="Address and contact details.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="trading-name" label="Trading name" value={draft.tradingName} onChange={(v) => set("tradingName", v)} />
              <Field id="contact-email" label="Contact email" value={draft.contactEmail} onChange={(v) => set("contactEmail", v)} />
              <Field id="contact-phone" label="Contact phone" value={draft.contactPhone} onChange={(v) => set("contactPhone", v)} />
              <Field id="address1" label="Address line 1" value={draft.addressLine1} onChange={(v) => set("addressLine1", v)} />
              <Field id="address2" label="Address line 2" value={draft.addressLine2} onChange={(v) => set("addressLine2", v)} />
              <Field id="city" label="City" value={draft.city} onChange={(v) => set("city", v)} />
              <Field id="state" label="State" value={draft.state} onChange={(v) => set("state", v)} />
              <Field id="postcode" label="Postcode" value={draft.postcode} onChange={(v) => set("postcode", v)} />
            </div>
          </Section>

          <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
            <Eyebrow className="text-gold-700">This build</Eyebrow>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-stone-600">
              Signed in as {session?.name} · {session?.role}. Authentication, the database
              and storage are real. There is no payment gateway by design — guests pay by
              UPI or transfer and upload a receipt, which staff verify.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to="/design-system">
                <Palette aria-hidden />
                Design system
              </Link>
            </Button>
          </section>
        </TabsContent>

        {/* --------------------------------------------------- departments */}
        <TabsContent value="departments" className="pt-5">
          <DepartmentManager />
        </TabsContent>

        {/* ---------------------------------------------------------- menu */}
        <TabsContent value="menu" className="pt-5">
          <MenuManager />
        </TabsContent>

        {/* -------------------------------------------------------- villas */}
        <TabsContent value="villas" className="pt-5">
          <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
            <Eyebrow className="text-gold-700">Villas</Eyebrow>
            <p className="mt-2 text-sm text-stone-600">
              Rooms, capacity, rates, times, amenities and Wi-Fi live on each villa.
            </p>
            <ul className="mt-4 space-y-3">
              {villas.map((villa) => (
                <li key={villa.id} className="flex flex-wrap items-center gap-4">
                  <img
                    src={villa.image}
                    alt=""
                    aria-hidden
                    className="size-12 rounded-lg object-cover ring-1 ring-gold/25"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{villa.name}</p>
                    <p className="text-xs text-stone-600">
                      {villa.mode === "whole" ? "Whole villa" : "Split into rooms"} ·{" "}
                      {villa.bedrooms} rooms · sleeps {villa.capacity} ·{" "}
                      {money(villa.baseRate)} base
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/admin/villas/${villa.id}`}>
                      <Building2 aria-hidden />
                      Edit
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </TabsContent>
        {/* ------------------------------------------------------- account */}
        <TabsContent value="account" className="pt-5">
          <AccountSettings />
        </TabsContent>
      </Tabs>

      {dirty && (
        <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-xl bg-ink p-4 text-sand shadow-deep ring-1 ring-gold/30">
          <p className="text-sm">You have unsaved changes.</p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-sand/70 hover:bg-sand/12 hover:text-sand"
              onClick={() => setDraft(settings)}
            >
              Discard
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              <Save aria-hidden />
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
      <h2 className="text-xl text-ink">{title}</h2>
      {note && <p className="mt-1.5 text-sm text-stone-600">{note}</p>}
      <hr className="rule-gold my-4" />
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
