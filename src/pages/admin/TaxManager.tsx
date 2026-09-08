import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eyebrow } from "@/components/common";
import { useMockData, useTaxes } from "@/hooks/useData";
import { configuredTaxRate, pct, taxBreakdown } from "@/services/domain";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Tax } from "@/types";

const BLANK = { name: "", percent: "", kind: "levy" as Tax["kind"] };

/**
 * The taxes the property charges.
 *
 * These name the parts of the rate; the rate on each booking stays the source
 * of truth for money already quoted. Switching one on changes what a *new*
 * booking is offered, never what an existing guest was charged — which is why
 * an old invoice still prints parts that add up to its own total.
 */
export function TaxManager() {
  const taxes = useTaxes();
  const { saveTax, deleteTax } = useMockData();
  const [draft, setDraft] = useState(BLANK);

  const total = configuredTaxRate(taxes);
  const sorted = [...taxes].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const percent = Number(draft.percent);
    if (draft.name.trim().length < 2) return toast.error("Give the tax a name");
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return toast.error("Enter a rate between 0 and 100");
    }
    if (taxes.some((t) => t.name.toLowerCase() === draft.name.trim().toLowerCase())) {
      return toast.error(`${draft.name.trim()} is already listed`);
    }

    saveTax({
      name: draft.name.trim(),
      rate: Number((percent / 100).toFixed(4)),
      kind: draft.kind,
      active: true,
      sortOrder: taxes.length,
    });
    setDraft(BLANK);
    toast.success(`${draft.name.trim()} added`);
  };

  // What the guest actually sees, on a round number, so the effect of a
  // change is visible before it reaches an invoice.
  const preview = taxBreakdown(Math.round(100000 * total), total, taxes, false);

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
        <Eyebrow className="text-gold-700">Taxes</Eyebrow>
        <h2 className="mt-2 text-xl text-ink">What the property charges</h2>
        <p className="mt-1.5 text-sm text-stone-600">
          A GST line splits into CGST and SGST for a guest from{" "}
          {`your own state, and becomes IGST for one from outside it`}. Anything else
          prints under its own name.
        </p>
        <hr className="rule-gold my-4" />

        {sorted.length === 0 ? (
          <p className="text-sm text-stone-600">
            No taxes configured. Invoices will show a single untitled tax line.
          </p>
        ) : (
          <ul className="divide-y divide-stone/15">
            {sorted.map((tax) => (
              <li key={tax.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {tax.name}
                    <span className="ml-2 text-sm font-normal text-stone-600">
                      {pct(tax.rate)}
                    </span>
                  </p>
                  <p className="text-xs text-stone-600">
                    {tax.kind === "gst"
                      ? "Splits into CGST + SGST, or IGST across a state border"
                      : "Prints as one line"}
                  </p>
                </div>

                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={tax.active}
                    onChange={(event) => saveTax({ ...tax, active: event.target.checked })}
                    className="size-4 accent-[var(--color-clay)]"
                  />
                  {tax.active ? "Charged" : "Off"}
                </label>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${tax.name}`}
                  className="text-status-cancelled hover:bg-status-cancelled-bg"
                  onClick={() => {
                    deleteTax(tax.id);
                    toast.success(`${tax.name} removed`);
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div
          className={cn(
            "mt-4 flex items-baseline justify-between rounded-lg p-3 text-sm",
            total > 0.28 ? "bg-status-cancelled-bg" : "bg-sand-200/60",
          )}
        >
          <span className="label-caps">Charged on a new booking</span>
          <span className="font-display text-xl tabular-nums text-ink">{pct(total)}</span>
        </div>
        {total > 0.28 && (
          <p role="alert" className="mt-2 text-sm text-ink">
            Above 28%. The booking form only accepts the legal GST rates, so a booking
            cannot be taken at this total.
          </p>
        )}
      </section>

      <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
        <h2 className="text-xl text-ink">Add a tax</h2>
        <hr className="rule-gold my-4" />
        <form onSubmit={add} className="grid gap-4 sm:grid-cols-[1fr_8rem_12rem_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="tax-name">Name</Label>
            <Input
              id="tax-name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Luxury cess"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax-rate">Rate %</Label>
            <Input
              id="tax-rate"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={draft.percent}
              onChange={(event) => setDraft({ ...draft, percent: event.target.value })}
              placeholder="2"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax-kind">Kind</Label>
            <Select
              value={draft.kind}
              onValueChange={(value) => setDraft({ ...draft, kind: value as Tax["kind"] })}
            >
              <SelectTrigger id="tax-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gst">GST (splits CGST/SGST)</SelectItem>
                <SelectItem value="levy">Other levy</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit">
            <Plus aria-hidden />
            Add
          </Button>
        </form>
      </section>

      {preview.length > 0 && (
        <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
          <Eyebrow className="text-gold-700">On an invoice</Eyebrow>
          <p className="mt-2 text-sm text-stone-600">
            How a {money(100000)} stay for a guest from your own state would print.
          </p>
          <hr className="rule-gold my-4" />
          <ul className="space-y-1.5 text-sm">
            {preview.map((line) => (
              <li key={line.label} className="flex justify-between gap-4">
                <span className="text-stone-600">{line.label}</span>
                <span className="tabular-nums text-ink">{money(line.amount)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-4 border-t border-gold/30 pt-2 font-medium">
              <span>Total tax</span>
              <span className="tabular-nums">
                {money(preview.reduce((sum, l) => sum + l.amount, 0))}
              </span>
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}
