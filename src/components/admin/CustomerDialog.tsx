import { useState } from "react";
import { toast } from "sonner";
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
import { useCustomers, useMockData } from "@/hooks/useData";
import { cleanPhone, isPhone } from "@/lib/format";
import type { Customer } from "@/types";

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
    });
    toast.success(customer ? `${name.trim()} updated` : `${name.trim()} added`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{customer ? `Edit ${customer.name}` : "Add a guest"}</DialogTitle>
            <DialogDescription>
              Enough to reach them and to recognise them next time. Bookings, payments
              and feedback attach themselves to this record.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="guest-name">Name</Label>
              <Input
                id="guest-name"
                required
                autoComplete="off"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Pooja Bothra"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="guest-phone">Phone</Label>
                <Input
                  id="guest-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(cleanPhone(event.target.value))}
                  placeholder="+91 98450 12345"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guest-email">Email</Label>
                <Input
                  id="guest-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="guest-city">City</Label>
              <Input
                id="guest-city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Bengaluru"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="guest-preferences">Preferences</Label>
              <Input
                id="guest-preferences"
                value={preferences}
                onChange={(event) => setPreferences(event.target.value)}
                placeholder="Vegetarian, early breakfast, poolside dining"
              />
              <p className="text-xs text-stone-600">Separate them with commas.</p>
            </div>

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
