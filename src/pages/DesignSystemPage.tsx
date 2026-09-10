import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  ChevronDown,
  Info,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DevBadge,
  Logo,
  EmptyState,
  ErrorState,
  Eyebrow,
  LoadingState,
  Skeleton,
  StatCard,
  StatusBadge,
} from "@/components/common";
import { bookingStatus, foodOrderStatus, paymentStatus, requestStatus } from "@/lib/status";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { collage, photo } from "@/lib/assets";

/* ------------------------------------------------------------------ layout */

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-gold/25 pt-12">
      <h2 className="text-2xl text-ink">{title}</h2>
      {description && <p className="mt-2 max-w-2xl text-sm text-stone-600">{description}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-8">
      <p className="label-caps w-40 shrink-0">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

const SECTIONS = [
  ["colour", "Colour"],
  ["type", "Typography"],
  ["spacing", "Spacing & shape"],
  ["buttons", "Buttons"],
  ["forms", "Forms & inputs"],
  ["status", "Status system"],
  ["surfaces", "Cards & surfaces"],
  ["data", "Tables"],
  ["overlays", "Overlays"],
  ["calendar", "Calendar"],
  ["photography", "Photography"],
  ["states", "States"],
] as const;

/* ------------------------------------------------------------------- page */

export default function DesignSystemPage() {
  const [month, setMonth] = useState<Date>(new Date("2026-09-01T00:00:00"));
  const [selected, setSelected] = useState<Date | undefined>(new Date("2026-09-12T00:00:00"));
  const [invalidEmail, setInvalidEmail] = useState("pooja@");
  const [saving, setSaving] = useState(false);

  return (
    <div className="min-h-dvh bg-sand">
      {/* Hero */}
      <header className="relative overflow-hidden bg-ink px-6 py-16 text-sand sm:px-10 sm:py-20">
        <img
          src={photo.maaya}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover opacity-25"
        />
        <div className="relative mx-auto max-w-6xl">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm text-sand/70 hover:text-sand"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to login
          </Link>
          <div className="mt-8">
            <Logo variant="onDark" size="h-24" />
          </div>
          <Eyebrow className="mt-8 text-gold-400">Living style guide</Eyebrow>
          <h1 className="display-caps mt-4 text-[2.5rem] text-white sm:text-[3.75rem]">
            The Sanctuary
            <br />
            <span className="text-gold-gradient">design system</span>
          </h1>
          <hr className="rule-gold mt-7 w-40" />
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-sand/75">
            Every token and primitive the CRM and the guest portal are built from.
            Raw stone, warm sand, timber and a single clay accent — a working tool
            that still sounds like the house it belongs to.
          </p>
          <div className="mt-8">
            <DevBadge className="bg-sand/12 text-sand" />
          </div>
        </div>
      </header>

      {/* Section nav */}
      <nav
        aria-label="Design system sections"
        className="sticky top-0 z-20 border-b border-stone/25 bg-sand/92 backdrop-blur"
      >
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6 py-3 sm:px-10">
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-lg px-3 py-1.5 text-sm whitespace-nowrap text-stone-600 transition-colors hover:bg-gold/12 hover:text-gold-700"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl space-y-14 px-6 py-14 sm:px-10">
        {/* ---------------------------------------------------------- colour */}
        <Section
          id="colour"
          title="Colour"
          description="Four brand tokens carry the identity. Status tones stay desaturated and earthy — never the bright red, green and yellow of a generic dashboard."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Ink", "#142731", "bg-ink", "Headings, navigation, primary buttons", "text-sand"],
              ["Sand", "#FAF7F3", "bg-sand", "Application background, warm surfaces", "text-ink"],
              ["Stone", "#A69C8E", "bg-stone", "Borders, muted text, dividers", "text-ink"],
              ["Clay", "#B5654A", "bg-clay", "Fills and accents. As text it fails AA — use clay-600", "text-sand"],
              ["Gold", "#C9A961", "bg-gold", "Rules, rings, display figures — from the mark", "text-ink"],
              ["White", "#FFFFFF", "bg-white", "Cards that need to lift off the sand", "text-ink"],
            ].map(([name, hex, bg, use, fg]) => (
              <div key={name} className="overflow-hidden rounded-xl shadow-soft">
                <div className={cn("flex h-28 items-end p-4", bg, fg)}>
                  <span className="font-display text-xl">{name}</span>
                </div>
                <div className="bg-paper p-4">
                  <p className="font-mono text-xs text-stone-600">{hex}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-stone-600">{use}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="label-caps mt-10 mb-4">Surface & neutral ramp</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {[
              ["paper", "bg-paper"],
              ["sand", "bg-sand"],
              ["sand-200", "bg-sand-200"],
              ["sand-300", "bg-sand-300"],
              ["stone-300", "bg-stone-300"],
              ["stone", "bg-stone"],
              ["stone-600", "bg-stone-600"],
              ["ink-300", "bg-ink-300"],
              ["ink-500", "bg-ink-500"],
              ["ink-700", "bg-ink-700"],
              ["ink", "bg-ink"],
              ["clay", "bg-clay"],
              ["gold-200", "bg-gold-200"],
              ["gold-400", "bg-gold-400"],
              ["gold", "bg-gold"],
              ["gold-700", "bg-gold-700"],
              ["white", "bg-white"],
            ].map(([name, bg]) => (
              <div key={name}>
                <div className={cn("h-14 rounded-lg shadow-soft", bg)} />
                <p className="mt-1.5 font-mono text-[0.6875rem] text-stone-600">{name}</p>
              </div>
            ))}
          </div>

          <p className="label-caps mt-10 mb-4">Brass accents</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-ink p-6 ring-1 ring-gold/30">
              <p className="label-caps text-gold-400">On ink</p>
              <p className="text-gold-gradient mt-2 font-display text-3xl">₹1,86,540</p>
              <hr className="rule-gold mt-4" />
              <p className="mt-3 text-xs text-sand/60">
                Gradient display figures and a hairline rule — the mark's own finish.
              </p>
            </div>
            <div className="rounded-xl bg-white p-6 ring-1 ring-gold/25">
              <p className="label-caps text-gold-700">On white</p>
              <p className="mt-2 font-display text-3xl text-ink">₹1,86,540</p>
              <hr className="rule-gold mt-4" />
              <p className="mt-3 text-xs text-stone-600">
                Gold-700 is the only brass that clears AA for text on a light ground.
              </p>
            </div>
            <div className="rounded-xl bg-sand-200 p-6">
              <p className="label-caps text-gold-700">Contrast rule</p>
              <p className="mt-3 text-sm leading-relaxed text-stone-600">
                Plain <span className="text-gold">gold</span> is decorative only — rules,
                rings, icons and large display type. It never carries body text on a
                light surface.
              </p>
            </div>
          </div>

          <p className="label-caps mt-10 mb-4">Status tones</p>
          <div className="flex flex-wrap gap-2">
            <StatusBadge label="Pending payment" tone="pending" />
            <StatusBadge label="Payment uploaded" tone="uploaded" />
            <StatusBadge label="Confirmed" tone="confirmed" />
            <StatusBadge label="In house" tone="inhouse" />
            <StatusBadge label="Cancelled" tone="cancelled" />
            <StatusBadge label="Completed" tone="completed" />
          </div>
        </Section>

        {/* ------------------------------------------------------------ type */}
        <Section
          id="type"
          title="Typography"
          description="Fraunces for display, Inter for everything that has to be read quickly. Generous line height, wide tracking on all-caps labels."
        >
          <div className="space-y-6 rounded-xl bg-paper p-8 shadow-soft">
            {[
              ["Editorial caps", "display-caps text-5xl", "Moments of stillness."],
              ["Display / 5xl", "text-5xl font-display", "Villa Maaya"],
              ["Display / 4xl", "text-4xl font-display", "Today at Sanctuary"],
              ["Heading / 2xl", "text-2xl font-display", "Payment verification"],
              ["Heading / xl", "text-xl font-display", "Booking HOS-1001"],
            ].map(([label, cls, sample]) => (
              <div key={label} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-8">
                <p className="label-caps w-40 shrink-0">{label}</p>
                <p className={cn(cls, "text-ink")}>{sample}</p>
              </div>
            ))}
            <Separator />
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-8">
              <p className="label-caps w-40 shrink-0">Body / base</p>
              <p className="max-w-lg text-base text-ink">
                The first house on the ridge. Rough-cut granite walls and a teak
                verandah that runs the full western face.
              </p>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-8">
              <p className="label-caps w-40 shrink-0">Body / sm</p>
              <p className="max-w-lg text-sm text-stone-600">
                Used for supporting copy, table cells and helper text throughout the admin.
              </p>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-8">
              <p className="label-caps w-40 shrink-0">Label / caps</p>
              <p className="label-caps">Check-in · Villa · Balance due</p>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-8">
              <p className="label-caps w-40 shrink-0">Numeric</p>
              <p className="font-display text-3xl text-ink tabular-nums">{money(143964)}</p>
            </div>
          </div>
        </Section>

        {/* --------------------------------------------------------- spacing */}
        <Section
          id="spacing"
          title="Spacing & shape"
          description="A 4px base. Prefer 16 / 24 / 32 / 48 between elements, and more than feels necessary between major sections."
        >
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-xl bg-paper p-6 shadow-soft">
              <p className="label-caps mb-4">Scale</p>
              <div className="space-y-2">
                {[4, 8, 12, 16, 24, 32, 48, 64].map((step) => (
                  <div key={step} className="flex items-center gap-4">
                    <span className="w-10 font-mono text-xs text-stone-600">{step}</span>
                    <div className="h-3 rounded bg-clay/35" style={{ width: step * 2 }} />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-paper p-6 shadow-soft">
              <p className="label-caps mb-4">Radius & shadow</p>
              <div className="grid grid-cols-3 gap-4">
                {[
                  ["lg", "rounded-lg", "shadow-soft"],
                  ["xl", "rounded-xl", "shadow-lift"],
                  ["2xl", "rounded-2xl", "shadow-deep"],
                ].map(([name, radius, shadow]) => (
                  <div key={name}>
                    <div className={cn("h-20 bg-sand-200", radius, shadow)} />
                    <p className="mt-2 font-mono text-[0.6875rem] text-stone-600">
                      {name} · {shadow.replace("shadow-", "")}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-xs leading-relaxed text-stone-600">
                Soft, low-opacity shadows do the work that hard borders would do in a
                denser product. Pill shapes are reserved for badges and chips.
              </p>
            </div>
          </div>
        </Section>

        {/* --------------------------------------------------------- buttons */}
        <Section
          id="buttons"
          title="Buttons"
          description="Every variant in its default, hover, focus, disabled and loading state."
        >
          <div className="divide-y divide-stone/20 rounded-xl bg-paper px-6 shadow-soft">
            <Row label="Primary">
              <Button>Confirm booking</Button>
              <Button className="shadow-lift">Hover</Button>
              <Button autoFocus={false} className="ring-3 ring-ring/50">Focus</Button>
              <Button disabled>Disabled</Button>
              <Button
                disabled={saving}
                aria-busy={saving}
                onClick={() => {
                  setSaving(true);
                  window.setTimeout(() => setSaving(false), 1600);
                }}
              >
                {saving ? "Saving…" : "Click to load"}
              </Button>
            </Row>
            <Row label="Secondary">
              <Button variant="secondary">Add a note</Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
            </Row>
            <Row label="Outline">
              <Button variant="outline">Edit booking</Button>
              <Button variant="outline" disabled>
                Disabled
              </Button>
            </Row>
            <Row label="Ghost">
              <Button variant="ghost">Dismiss</Button>
              <Button variant="ghost" disabled>
                Disabled
              </Button>
            </Row>
            <Row label="Destructive">
              <Button variant="destructive">
                <Trash2 aria-hidden />
                Cancel booking
              </Button>
              <Button variant="destructive" disabled>
                Disabled
              </Button>
            </Row>
            <Row label="Link">
              <Button variant="link">View the invoice</Button>
            </Row>
            <Row label="Sizes">
              <Button size="sm">Small</Button>
              <Button>Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Search">
                <Search aria-hidden />
              </Button>
            </Row>
          </div>
        </Section>

        {/* ----------------------------------------------------------- forms */}
        <Section
          id="forms"
          title="Forms & inputs"
          description="Errors are announced, not just coloured. Every field has a visible label and a described hint."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-5 rounded-xl bg-paper p-6 shadow-soft">
              <div className="space-y-2">
                <Label htmlFor="ds-name">Guest name</Label>
                <Input id="ds-name" defaultValue="Pooja Bothra" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ds-phone">Phone</Label>
                <Input id="ds-phone" placeholder="+91 " />
                <p className="text-xs text-stone-600">Used for booking confirmations over WhatsApp.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ds-email">Email</Label>
                <Input
                  id="ds-email"
                  value={invalidEmail}
                  onChange={(e) => setInvalidEmail(e.target.value)}
                  aria-invalid={!invalidEmail.includes("@.") && !/^\S+@\S+\.\S+$/.test(invalidEmail)}
                  aria-describedby="ds-email-error"
                />
                {!/^\S+@\S+\.\S+$/.test(invalidEmail) && (
                  <p id="ds-email-error" role="alert" className="text-xs text-status-cancelled">
                    Enter a complete email address, for example pooja@example.com
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ds-disabled">Booking reference</Label>
                <Input id="ds-disabled" defaultValue="HOS-1001" disabled />
              </div>
            </div>

            <div className="space-y-5 rounded-xl bg-paper p-6 shadow-soft">
              <div className="space-y-2">
                <Label htmlFor="ds-villa">Villa</Label>
                <Select defaultValue="maaya">
                  <SelectTrigger id="ds-villa" className="w-full">
                    <SelectValue placeholder="Choose a villa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maaya">Villa Maaya</SelectItem>
                    <SelectItem value="praana">Villa Praana</SelectItem>
                    <SelectItem value="nirvaana">Villa Nirvaana</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ds-notes">Special requests</Label>
                <Textarea
                  id="ds-notes"
                  rows={5}
                  defaultValue="Vegetarian kitchen for the whole stay. Dinner on the sunset deck on the second night."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ds-search">Search</Label>
                <div className="relative">
                  <Search
                    className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone"
                    aria-hidden
                  />
                  <Input id="ds-search" className="pl-9" placeholder="Guest, reference or phone" />
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- status */}
        <Section
          id="status"
          title="Status system"
          description="Booking, payment, kitchen and request states, each mapped to one of six tones. The label always travels with the colour."
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Booking lifecycle", bookingStatus.all],
              ["Payment", paymentStatus.all],
              ["Kitchen", foodOrderStatus.all],
              ["Requests", requestStatus.all],
            ].map(([title, items]) => (
              <div key={title as string} className="rounded-xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.06]">
                <p className="label-caps mb-4">{title as string}</p>
                <div className="flex flex-wrap gap-2">
                  {(items as { label: string; tone: never; value: string }[]).map((item) => (
                    <StatusBadge key={item.value} label={item.label} tone={item.tone} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* -------------------------------------------------------- surfaces */}
        <Section
          id="surfaces"
          title="Cards & surfaces"
          description="Photography-led cards for villas and menu items; quiet figure cards for the admin dashboard."
        >
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.07] transition-shadow hover:shadow-lift">
              <img
                src={photo.maaya}
                alt="The verandah at Villa Maaya"
                className="h-48 w-full object-cover"
              />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl text-ink">Villa Maaya</h3>
                  <StatusBadge label="Whole villa" tone="confirmed" />
                </div>
                <p className="mt-2 text-sm text-stone-600">
                  4 bedrooms · sleeps 10 · from {money(32000)} a night
                </p>
                <div className="mt-4 flex gap-2">
                  <Badge variant="secondary">Pool</Badge>
                  <Badge variant="secondary">Verandah</Badge>
                  <Badge variant="secondary">Chef on request</Badge>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-2">
              <StatCard label="In house" value="21 guests" hint="Across 3 villas" icon={<BedDouble className="size-4" />} />
              <StatCard label="Awaiting verification" value="3" hint="Oldest waiting 18 hours" tone="warn" icon={<Wallet className="size-4" />} />
              <StatCard label="Outstanding" value={money(186540)} hint="Across 4 live bookings" tone="accent" />
              <StatCard label="Arrivals today" value="1" hint="Villa Maaya at 2:00 pm" icon={<CalendarDays className="size-4" />} />
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Card primitive</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-stone-600">
                The stock shadcn card, restyled through the token layer — paper
                surface, soft shadow, no hard border.
              </CardContent>
            </Card>
            <div className="rounded-xl bg-status-uploaded-bg p-5 lg:col-span-2">
              <div className="flex gap-3">
                <Info className="mt-0.5 size-4 shrink-0 text-status-uploaded" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-ink">Inline alert</p>
                  <p className="mt-1 text-sm text-stone-600">
                    Villa Praana is operating in split-room mode. Whole-villa bookings
                    are blocked while any room is held.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------ data */}
        <Section
          id="data"
          title="Tables"
          description="The admin's primary surface. Dense, quiet, and scannable — status and money align to the right."
        >
          <div className="overflow-x-auto rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Villa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ["HOS-1001", "Pooja Bothra", "Villa Maaya", "Confirmed", "confirmed", 89240],
                  ["HOS-1005", "Ankit Deshpande", "Villa Maaya", "Payment uploaded", "uploaded", 88030],
                  ["HOS-1006", "Farhan Qureshi", "Villa Nirvaana", "Pending payment", "pending", 129800],
                  ["HOS-1002", "Prerna Lal Chugani", "Villa Nirvaana", "In house", "inhouse", 0],
                ].map(([ref, guest, villa, label, tone, balance]) => (
                  <TableRow key={ref as string}>
                    <TableCell className="font-medium">{ref}</TableCell>
                    <TableCell>{guest}</TableCell>
                    <TableCell className="text-stone-600">{villa}</TableCell>
                    <TableCell>
                      <StatusBadge label={label as string} tone={tone as never} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(balance as number)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>

        {/* -------------------------------------------------------- overlays */}
        <Section
          id="overlays"
          title="Overlays & navigation"
          description="Dialogs confirm destructive actions. Sheets carry detail on narrow screens. Tabs section long records."
        >
          <div className="rounded-xl bg-paper p-6 shadow-soft">
            <div className="flex flex-wrap gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive">Cancel booking</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cancel HOS-1001?</DialogTitle>
                    <DialogDescription>
                      Villa Maaya will be released for 12–15 September and the guest
                      will be notified. This cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline">Keep the booking</Button>
                    <Button variant="destructive">Cancel it</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">Open a sheet</Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Booking HOS-1001</SheetTitle>
                    <SheetDescription>
                      Pooja Bothra · Villa Maaya · 12–15 September 2026
                    </SheetDescription>
                  </SheetHeader>
                  <div className="px-4 text-sm text-stone-600">
                    Sheets carry booking detail on tablet and mobile, where the split
                    view does not fit.
                  </div>
                </SheetContent>
              </Sheet>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary">
                    Actions
                    <ChevronDown aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem>Check in</DropdownMenuItem>
                  <DropdownMenuItem>Add a note</DropdownMenuItem>
                  <DropdownMenuItem>Approve payment</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive">Cancel booking</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost">Hover for a tooltip</Button>
                </TooltipTrigger>
                <TooltipContent>Balance due after the approved advance</TooltipContent>
              </Tooltip>
            </div>

            <Tabs defaultValue="stay" className="mt-8">
              <TabsList>
                <TabsTrigger value="stay">Stay</TabsTrigger>
                <TabsTrigger value="money">Financials</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>
              <TabsContent value="stay" className="pt-4 text-sm text-stone-600">
                Villa Maaya, whole villa, 3 nights, 8 adults and 2 children.
              </TabsContent>
              <TabsContent value="money" className="pt-4 text-sm text-stone-600">
                {money(96000)} room charge, {money(12000)} weekend surcharge,{" "}
                {money(60000)} paid.
              </TabsContent>
              <TabsContent value="timeline" className="pt-4 text-sm text-stone-600">
                Receipt uploaded 10:31 · approved 10:45 · confirmed 10:46.
              </TabsContent>
            </Tabs>
          </div>
        </Section>

        {/* -------------------------------------------------------- calendar */}
        <Section
          id="calendar"
          title="Calendar"
          description="Used for arrival and departure pickers, and as the base of the master calendar."
        >
          <div className="inline-block rounded-xl bg-paper p-4 shadow-soft">
            <Calendar
              mode="single"
              month={month}
              onMonthChange={setMonth}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        </Section>

        {/* ----------------------------------------------------- photography */}
        <Section
          id="photography"
          title="Photography"
          description="The property's own images carry the brand more than any component does. Large, uncropped where possible, and never a tiny thumbnail."
        >
          <div className="grid gap-3 sm:grid-cols-4 sm:grid-rows-2">
            {collage.map((image, index) => (
              <figure
                key={image.src}
                className={cn(
                  "group relative overflow-hidden rounded-xl shadow-soft",
                  index === 0 && "sm:col-span-2 sm:row-span-2",
                )}
              >
                <img
                  src={image.src}
                  alt={image.alt}
                  loading="lazy"
                  className={cn(
                    "w-full object-cover transition-transform duration-700 group-hover:scale-105",
                    index === 0 ? "h-64 sm:h-full" : "h-40",
                  )}
                />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-4 text-xs text-sand opacity-0 transition-opacity group-hover:opacity-100">
                  {image.alt}
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-paper p-5 shadow-soft">
              <p className="label-caps mb-3">The mark on ink</p>
              <div className="flex items-center justify-center rounded-lg bg-ink p-6">
                <Logo variant="onDark" size="h-20" />
              </div>
            </div>
            <div className="rounded-xl bg-paper p-5 shadow-soft">
              <p className="label-caps mb-3">The mark on sand</p>
              <div className="flex items-center justify-center rounded-lg bg-sand p-6">
                <Logo variant="onLight" size="h-20" />
              </div>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- states */}
        <Section
          id="states"
          title="Loading, empty, error & success"
          description="Every list and form has all four. None of them are a bare spinner on white."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl bg-paper p-6 shadow-soft">
              <p className="label-caps mb-4">Loading</p>
              <LoadingState label="Fetching bookings" />
              <Separator className="my-4" />
              <p className="label-caps mb-3">Skeleton</p>
              <div className="space-y-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>

            <div className="space-y-6">
              <EmptyState
                title="No bookings match those filters"
                description="Try widening the date range, or clear the villa filter to see everything."
                action={
                  <Button variant="outline" className="mt-2">
                    Clear filters
                  </Button>
                }
              />
              <ErrorState description="The payment receipt could not be loaded. Ask the guest to upload it again." />
              <div className="flex items-start gap-3 rounded-xl bg-status-confirmed-bg p-5">
                <span
                  className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-status-confirmed text-[0.6875rem] text-white"
                  aria-hidden
                >
                  ✓
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">Payment approved</p>
                  <p className="mt-1 text-sm text-stone-600">
                    HOS-1005 is now confirmed. The guest has been sent directions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Section>
      </main>

      <footer className="border-t border-stone/25 px-6 py-10 text-sm text-stone-600 sm:px-10">
        <div className="mx-auto max-w-6xl">
          Homes of Sanctuary · internal design system · UI-only phase
        </div>
      </footer>
    </div>
  );
}
