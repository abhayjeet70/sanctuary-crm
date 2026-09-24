import { useState } from "react";
import { toast } from "sonner";
import { Hourglass } from "lucide-react";
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
import { useMockData, useVillas } from "@/hooks/useData";
import { useSession } from "@/services/session";
import { addDays, toISODate } from "@/services/domain";

const ANY = "any";

/**
 * Join the queue without running a search first.
 *
 * The booking form only offers the waiting list after it has shown you what
 * is sold. Somebody who already knows the house and the dates they want should
 * be able to say so directly — pick a villa (or "any"), the dates, the party.
 */
export function QuickWaitlistForm() {
  const villas = useVillas();
  const { session } = useSession();
  const { joinWaitlist, today } = useMockData();

  const [villa, setVilla] = useState(ANY);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      return toast.error("Choose your arrival and a later departure");
    }
    if (!session?.customerId) {
      return toast.error("We could not find your guest record — call us and we will add you");
    }
    setBusy(true);
    const { error } = await joinWaitlist({
      customerId: session.customerId,
      villaId: villa === ANY ? undefined : villa,
      checkIn,
      checkOut,
      adults: Number(adults) || 1,
      children: Number(children) || 0,
      source: "website",
      note: "",
      roomIds: [],
    });
    setBusy(false);
    if (error) return toast.error("Could not add you to the list", { description: error });
    toast.success("You are on the waiting list");
    setCheckIn("");
    setCheckOut("");
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink/[0.07]"
    >
      <Eyebrow className="text-gold-700">Join the waiting list</Eyebrow>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="wl-villa">Which house</Label>
          <Select value={villa} onValueChange={setVilla}>
            <SelectTrigger id="wl-villa" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any house that frees up</SelectItem>
              {villas.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wl-in">Arrive</Label>
          <Input id="wl-in" type="date" min={today} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wl-out">Depart</Label>
          <Input
            id="wl-out"
            type="date"
            min={checkIn ? addDays(checkIn, 1) : toISODate(new Date())}
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wl-adults">Adults</Label>
          <Input id="wl-adults" type="number" min={1} value={adults} onChange={(e) => setAdults(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wl-children">Children</Label>
          <Input id="wl-children" type="number" min={0} value={children} onChange={(e) => setChildren(e.target.value)} />
        </div>
      </div>
      <Button type="submit" disabled={busy}>
        <Hourglass aria-hidden />
        {busy ? "Adding you…" : "Put me on the list"}
      </Button>
    </form>
  );
}
