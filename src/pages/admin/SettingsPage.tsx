import { Link } from "react-router-dom";
import { Building2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DevBadge, Eyebrow, PageHeader } from "@/components/common";
import { useVillas } from "@/hooks/useData";
import { useSession } from "@/services/mock/MockSessionProvider";
import { money } from "@/lib/format";

/** Property-level settings. Most real configuration lives on the villa itself,
 *  so this page points there rather than duplicating the fields. */
export default function SettingsPage() {
  const villas = useVillas();
  const { session } = useSession();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Property configuration"
        title="Settings"
        description="Rates, times, amenities and Wi-Fi are edited on each villa. What is left lives here."
      />

      <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
        <Eyebrow className="text-gold-700">Property</Eyebrow>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            ["Name", "Homes of Sanctuary"],
            ["Location", "Nandi Hills, Chikkaballapur, Karnataka"],
            ["Villas", `${villas.length} · ${villas.reduce((n, v) => n + v.bedrooms, 0)} bedrooms`],
            ["Currency", "Indian rupee (INR)"],
            ["Default GST", "18%"],
            ["Signed in as", `${session?.name} · ${session?.role}`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="label-caps">{label}</dt>
              <dd className="mt-1 text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
        <Eyebrow className="text-gold-700">Villas</Eyebrow>
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
                  {money(villa.baseRate)} base · check-in {villa.checkInTime}
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

      <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
        <Eyebrow className="text-gold-700">This build</Eyebrow>
        <div className="mt-3">
          <DevBadge />
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600">
          There is no authentication, database or payment gateway behind this build. Every
          change you make lives in memory and resets on refresh. Removing the mock login is a
          matter of deleting <code className="text-gold-700">MockSessionProvider</code> and the
          badge above.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/design-system">
            <Palette aria-hidden />
            Design system
          </Link>
        </Button>
      </section>
    </div>
  );
}
