import { useState } from "react";
import { toast } from "sonner";
import { Check, Clock, Copy, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, Eyebrow } from "@/components/common";
import { useGuestStay } from "@/hooks/useGuest";

export default function GuestAmenitiesPage() {
  const { view } = useGuestStay();
  const [copied, setCopied] = useState(false);

  if (!view?.villa) return <ErrorState className="m-5" title="No stay found" />;
  const { villa } = view;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(villa.wifiPassword);
      setCopied(true);
      toast.success("Wi-Fi password copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — the password is shown on screen");
    }
  };

  return (
    <div className="pb-8">
      <section className="relative">
        <img
          src={villa.image}
          alt={villa.name}
          className="h-56 w-full object-cover sm:h-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/45 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
          <Eyebrow className="text-gold-400">Your villa</Eyebrow>
          <h1 className="display-caps mt-2 text-3xl text-white sm:text-5xl">{villa.name}</h1>
        </div>
      </section>

      <div className="space-y-6 p-5 sm:p-8">
        <p className="max-w-2xl text-base leading-relaxed text-ink">{villa.description}</p>

        {/* --------------------------------------------------------- wifi */}
        <section className="overflow-hidden rounded-2xl bg-ink text-sand shadow-lift ring-1 ring-gold/30">
          <div className="relative p-6 sm:p-8">
            <div
              aria-hidden
              className="absolute -top-16 -right-16 size-52 rounded-full bg-gold/15 blur-3xl"
            />
            <div className="relative">
              <div className="flex items-center gap-2">
                <Wifi className="size-4 text-gold-400" aria-hidden />
                <Eyebrow className="text-gold-400">Wi-Fi</Eyebrow>
              </div>
              <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                <div>
                  <dt className="label-caps text-sand/50">Network</dt>
                  <dd className="text-gold-gradient mt-2 font-display text-3xl">
                    {villa.wifiNetwork}
                  </dd>
                </div>
                <div>
                  <dt className="label-caps text-sand/50">Password</dt>
                  <dd className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="font-mono text-2xl tracking-wide text-sand">
                      {villa.wifiPassword}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gold-200 hover:bg-gold/15 hover:text-white"
                      onClick={copy}
                    >
                      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </dd>
                </div>
              </dl>
              <hr className="rule-gold mt-6" />
              <p className="mt-4 text-sm text-sand/65">
                The signal reaches the pool and the verandah. If it drops anywhere, raise a
                request and someone will look at it.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- times */}
        <section className="grid gap-4 sm:grid-cols-2">
          {[
            ["Check-in", villa.checkInTime, "Your rooms are ready from this time."],
            ["Check-out", villa.checkOutTime, "Late check-out on request, subject to the next stay."],
          ].map(([label, time, hint]) => (
            <div
              key={label}
              className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.06]"
            >
              <p className="flex items-center gap-2">
                <Clock className="size-4 text-gold-700" aria-hidden />
                <span className="label-caps">{label}</span>
              </p>
              <p className="mt-2 font-display text-2xl text-ink tabular-nums">{time}</p>
              <p className="mt-1 text-xs text-stone-600">{hint}</p>
            </div>
          ))}
        </section>

        {/* ------------------------------------------------------ amenities */}
        <section>
          <Eyebrow className="mb-3 text-gold-700">What is here</Eyebrow>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {villa.amenities.map((amenity) => (
              <li
                key={amenity}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink/[0.06]"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold/12 text-gold-700">
                  <Check className="size-4" aria-hidden />
                </span>
                <span className="text-sm text-ink">{amenity}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* -------------------------------------------------------- gallery */}
        <section>
          <Eyebrow className="mb-3 text-gold-700">The house</Eyebrow>
          <ul className="grid gap-3 sm:grid-cols-3">
            {villa.gallery.map((src, index) => (
              <li key={`${src}-${index}`} className="overflow-hidden rounded-2xl ring-1 ring-gold/20">
                <img
                  src={src}
                  alt={`${villa.name}, view ${index + 1}`}
                  loading="lazy"
                  className="h-44 w-full object-cover transition-transform duration-700 hover:scale-105"
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
