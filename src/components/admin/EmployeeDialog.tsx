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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDepartments, useEmployeePay, useMockData } from "@/hooks/useData";
import { useShowsFinancials } from "@/services/session";
import { cleanPhone, isPhone } from "@/lib/format";
import { titleCase } from "@/lib/status";
import type { Employee, EmployeeStatus, EmploymentType } from "@/types";

const TYPES: EmploymentType[] = ["full_time", "part_time", "contract", "seasonal"];
const STATUSES: EmployeeStatus[] = ["active", "on_leave", "left"];
const NO_TEAM = "none";

/** Plain words for the permission keys, for the line under the picker. */
const PERMISSION_WORDS: Record<string, string> = {
  "requests.work": "work their requests",
  "requests.all": "see every request",
  "kitchen.work": "work kitchen orders",
  "bookings.view": "view bookings",
  "guests.view": "view guest records",
};

/**
 * Add or edit an employee.
 *
 * Their login is not set up here — that is its own action on the record,
 * because most of a housekeeping team never signs in and creating an account
 * for everyone would be noise, not a feature.
 */
export function EmployeeDialog({
  employee,
  onClose,
}: {
  /** Null when adding. */
  employee: Employee | null;
  onClose: () => void;
}) {
  const { saveEmployee, savePay } = useMockData();
  const departments = useDepartments().filter(
    // A retired department stays visible on whoever is already in it, so an
    // existing record does not silently change department on the next save.
    (d) => d.active || d.id === employee?.departmentId,
  );
  const pay = useEmployeePay(employee?.id);
  const showsPay = useShowsFinancials();

  const [form, setForm] = useState({
    fullName: employee?.fullName ?? "",
    designation: employee?.designation ?? "",
    departmentId: employee?.departmentId ?? NO_TEAM,
    phone: employee?.phone ?? "",
    email: employee?.email ?? "",
    dateOfJoining: employee?.dateOfJoining ?? "",
    employmentType: employee?.employmentType ?? ("full_time" as EmploymentType),
    status: employee?.status ?? ("active" as EmployeeStatus),
    address: employee?.address ?? "",
    emergencyName: employee?.emergencyName ?? "",
    emergencyPhone: employee?.emergencyPhone ?? "",
    idDocument: employee?.idDocument ?? "",
    notes: employee?.notes ?? "",
    salary: pay ? String(pay.monthlySalary) : "",
  });

  const chosen = departments.find((d) => d.id === form.departmentId);

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (form.fullName.trim().length < 2) return toast.error("Enter their name");
    if (form.phone.trim() && !isPhone(form.phone)) {
      return toast.error("That is not a phone number we could ring");
    }
    if (form.emergencyPhone.trim() && !isPhone(form.emergencyPhone)) {
      return toast.error("The emergency number does not look right");
    }

    saveEmployee({
      id: employee?.id,
      fullName: form.fullName.trim(),
      designation: form.designation.trim(),
      departmentId: form.departmentId === NO_TEAM ? undefined : form.departmentId,
      phone: form.phone.trim(),
      email: form.email.trim(),
      dateOfJoining: form.dateOfJoining || undefined,
      employmentType: form.employmentType,
      status: form.status,
      address: form.address.trim(),
      emergencyName: form.emergencyName.trim(),
      emergencyPhone: form.emergencyPhone.trim(),
      idDocument: form.idDocument.trim(),
      notes: form.notes.trim(),
    });

    // Pay is a separate table with its own permission, so a separate write —
    // and only when the owner actually typed a number.
    if (showsPay && employee && form.salary.trim()) {
      savePay(employee.id, Math.max(0, Math.round(Number(form.salary) || 0)));
    }

    toast.success(employee ? `${form.fullName.trim()} updated` : `${form.fullName.trim()} added`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {employee ? `Edit ${employee.fullName}` : "Add an employee"}
            </DialogTitle>
            <DialogDescription>
              {employee
                ? `${employee.employeeCode} — their portal login is managed on the record.`
                : "The roster record. A login can be created afterwards, if they need one."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-5">
            <Section title="Who they are">
              <Field label="Full name" htmlFor="emp-name">
                <Input
                  id="emp-name"
                  required
                  value={form.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                  placeholder="Lakshmi Devi"
                />
              </Field>
              <Field label="Designation" htmlFor="emp-designation">
                <Input
                  id="emp-designation"
                  list="designation-suggestions"
                  value={form.designation}
                  onChange={(e) => set("designation", e.target.value)}
                  placeholder="Villa attendant"
                />
                {/* The titles the owner listed against this department. */}
                <datalist id="designation-suggestions">
                  {(chosen?.designations ?? []).map((title) => (
                    <option key={title} value={title} />
                  ))}
                </datalist>
              </Field>
              <Field
                label="Department"
                htmlFor="emp-team"
                hint={
                  chosen
                    ? chosen.permissions.length > 0
                      ? `They will be able to: ${chosen.permissions
                          .map((p) => PERMISSION_WORDS[p] ?? p)
                          .join(", ")}.`
                      : "This department has no permissions yet — set them in Departments."
                    : "Departments are set up in Settings → Departments."
                }
              >
                <Select
                  value={form.departmentId}
                  onValueChange={(v) => set("departmentId", v)}
                >
                  <SelectTrigger id="emp-team">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEAM}>No department</SelectItem>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.name}
                        {!department.active && " (retired)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Employment" htmlFor="emp-type">
                <Select
                  value={form.employmentType}
                  onValueChange={(v) => set("employmentType", v)}
                >
                  <SelectTrigger id="emp-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {titleCase(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Section>

            <Section title="How to reach them">
              <Field label="Phone" htmlFor="emp-phone">
                <Input
                  id="emp-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", cleanPhone(e.target.value))}
                  placeholder="+91 98450 12345"
                />
              </Field>
              <Field label="Email" htmlFor="emp-email" hint="Needed for a portal login">
                <Input
                  id="emp-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="name@example.com"
                />
              </Field>
              <Field label="Emergency contact" htmlFor="emp-emg-name">
                <Input
                  id="emp-emg-name"
                  value={form.emergencyName}
                  onChange={(e) => set("emergencyName", e.target.value)}
                  placeholder="Name"
                />
              </Field>
              <Field label="Emergency phone" htmlFor="emp-emg-phone">
                <Input
                  id="emp-emg-phone"
                  type="tel"
                  value={form.emergencyPhone}
                  onChange={(e) => set("emergencyPhone", cleanPhone(e.target.value))}
                  placeholder="+91 98450 12345"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address" htmlFor="emp-address">
                  <Input
                    id="emp-address"
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                    placeholder="Village, town, district"
                  />
                </Field>
              </div>
            </Section>

            <Section title="Employment record">
              <Field label="Joined on" htmlFor="emp-joined">
                <Input
                  id="emp-joined"
                  type="date"
                  value={form.dateOfJoining}
                  onChange={(e) => set("dateOfJoining", e.target.value)}
                />
              </Field>
              <Field label="Status" htmlFor="emp-status">
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger id="emp-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {titleCase(status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="ID document"
                htmlFor="emp-id"
                hint="A reference only — do not store the full number"
              >
                <Input
                  id="emp-id"
                  value={form.idDocument}
                  onChange={(e) => set("idDocument", e.target.value)}
                  placeholder="Aadhaar ending 4821"
                />
              </Field>
              {showsPay && employee && (
                <Field label="Monthly salary (₹)" htmlFor="emp-salary" hint="Owner only">
                  <Input
                    id="emp-salary"
                    type="number"
                    min={0}
                    step={500}
                    value={form.salary}
                    onChange={(e) => set("salary", e.target.value)}
                    placeholder="28000"
                  />
                </Field>
              )}
            </Section>

            <div className="space-y-1.5">
              <Label htmlFor="emp-notes">Notes</Label>
              <Textarea
                id="emp-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Shift preferences, languages, anything the roster should know."
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{employee ? "Save" : "Add employee"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="label-caps text-gold-700">{title}</p>
      <hr className="rule-gold mt-2 mb-4" />
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
