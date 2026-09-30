import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eyebrow, StatCard } from "@/components/common";
import { useMockData } from "@/hooks/useData";
import { hardwarePlan, VENDORS } from "@/lib/captiveWifi";
import type { ControllerVendor } from "@/services/wifi/types";

const PLANNABLE: ControllerVendor[] = ["unifi", "omada", "mikrotik"];

/**
 * The shopping list. Sized from the villas already in the CRM (bedrooms and
 * capacity), so it changes when a villa does. Model names are examples of each
 * vendor's range — confirm current availability with your supplier.
 */
export function HardwareCard({ configured }: { configured: ControllerVendor }) {
  const { villas } = useMockData();
  const [vendor, setVendor] = useState<ControllerVendor>(configured === "mock" ? "unifi" : configured);
  const [outdoor, setOutdoor] = useState("1");
  const [failover, setFailover] = useState(true);

  const plan = useMemo(
    () =>
      hardwarePlan(
        villas.map((v) => ({
          name: v.name,
          bedrooms: v.bedrooms,
          capacity: v.capacity,
          installedAps: v.wifiApCount ?? 0,
        })),
        { vendor, outdoorZonesPerVilla: Math.max(0, Math.min(4, Number(outdoor) || 0)), failover },
      ),
    [villas, vendor, outdoor, failover],
  );
  const toBuy = plan.perVilla.reduce((n, v) => n + v.toBuy, 0);

  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06] print:shadow-none print:ring-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow className="text-gold-700">Hardware needed</Eyebrow>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">
              What to buy for {villas.length} villas, sized from their bedrooms and capacity. This list
              is guidance to take to a supplier or installer — get a site survey before ordering.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
            <Printer aria-hidden />
            Print list
          </Button>
        </div>

        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3 print:hidden">
          <div className="space-y-1.5">
            <Label htmlFor="hw-vendor">Plan for</Label>
            <Select value={vendor} onValueChange={(v) => setVendor(v as ControllerVendor)}>
              <SelectTrigger id="hw-vendor" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLANNABLE.map((k) => (
                  <SelectItem key={k} value={k}>{VENDORS[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hw-out">Outdoor zones per villa</Label>
            <Input id="hw-out" type="number" min={0} max={4} value={outdoor} onChange={(e) => setOutdoor(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink">
            <input type="checkbox" checked={failover} onChange={(e) => setFailover(e.target.checked)} className="size-4 accent-[var(--color-clay)]" />
            Include a failover internet line
          </label>
        </div>

        <p className="text-sm text-stone-600">{VENDORS[vendor].blurb}</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Access points in total" value={plan.totalAps} hint={toBuy ? `${toBuy} still to buy` : "All installed"} />
          <StatCard label="Internet needed" value={`${plan.recommendedMbps} Mbps`} hint="At full occupancy" />
          <StatCard label="Per villa" value={plan.perVilla.map((v) => v.totalAps).join(" · ")} hint="Access points" />
        </div>
      </section>

      <section className="relative overflow-x-auto rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06] print:shadow-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Villa</TableHead>
              <TableHead className="text-center">Indoor APs</TableHead>
              <TableHead className="text-center">Outdoor APs</TableHead>
              <TableHead className="text-center">Total</TableHead>
              <TableHead className="text-center">Installed</TableHead>
              <TableHead className="text-center">To buy</TableHead>
              <TableHead className="text-center">Switch ports</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plan.perVilla.map((v) => (
              <TableRow key={v.name}>
                <TableCell className="font-medium text-ink">{v.name}</TableCell>
                <TableCell className="text-center tabular-nums">{v.indoorAps}</TableCell>
                <TableCell className="text-center tabular-nums">{v.outdoorAps}</TableCell>
                <TableCell className="text-center tabular-nums">{v.totalAps}</TableCell>
                <TableCell className="text-center tabular-nums">{v.installed}</TableCell>
                <TableCell className="text-center font-medium tabular-nums">{v.toBuy}</TableCell>
                <TableCell className="text-center tabular-nums">{v.switchPorts}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06] print:shadow-none">
        <Eyebrow className="text-gold-700">Bill of materials</Eyebrow>
        <ul className="mt-4 divide-y divide-ink/8">
          {plan.lines.map((l) => (
            <li key={l.item} className="grid grid-cols-[3rem_1fr] gap-x-4 gap-y-1 py-4 sm:grid-cols-[3rem_1fr_1fr]">
              <span className="font-display text-2xl tabular-nums text-ink">{l.quantity}×</span>
              <div className="min-w-0">
                <p className="font-medium text-ink">{l.item}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-stone-600">{l.why}</p>
              </div>
              <p className="col-start-2 text-xs leading-relaxed text-stone-600 sm:col-start-3">
                <span className="label-caps block text-gold-700">e.g.</span>
                {l.examples}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl bg-sand/70 p-6 ring-1 ring-ink/[0.06] print:ring-0">
        <Eyebrow className="text-gold-700">Before you buy</Eyebrow>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink">
          {plan.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
