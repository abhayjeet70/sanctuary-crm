import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/common";
import { JobTitlesEditor } from "@/components/admin/JobTitlesEditor";
import { useDepartments, useEmployees, useMockData } from "@/hooks/useData";
import { cn } from "@/lib/utils";
import type { Department, PermissionKey } from "@/types";

/**
 * Every permission a department can hold, and what granting it actually does.
 *
 * The wording matters: an owner ticking a box is making a decision about who
 * sees guests' phone numbers, so the label says that rather than "guests.view".
 */
const PERMISSIONS: { key: PermissionKey; label: string; detail: string }[] = [
  {
    key: "requests.work",
    label: "Work their own requests",
    detail: "See and complete the guest requests routed to this department.",
  },
  {
    key: "requests.all",
    label: "See every department's requests",
    detail: "The whole board, not only their own. For the desk.",
  },
  {
    key: "kitchen.work",
    label: "Work kitchen orders",
    detail: "See in-villa orders and move them along the pass.",
  },
  {
    key: "bookings.view",
    label: "View bookings",
    detail: "Read stays and dates. Read-only — nobody here can change one.",
  },
  {
    key: "guests.view",
    label: "View guest records",
    detail: "Names, phone numbers and email addresses of guests.",
  },
];

const BLANK = { name: "", description: "" };

/**
 * The departments the property runs, and what each may do.
 *
 * Changing a permission changes it in the database, not just on screen — the
 * policies read these rows directly, so a tick here reaches an employee's
 * access the next time they load a page.
 */
export function DepartmentManager() {
  const departments = useDepartments();
  const employees = useEmployees();
  const { saveDepartment, deleteDepartment } = useMockData();
  const [draft, setDraft] = useState(BLANK);

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (name.length < 2) return toast.error("Give the department a name");
    if (departments.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
      return toast.error(`${name} already exists`);
    }

    saveDepartment({
      name,
      description: draft.description.trim(),
      designations: [],
      sortOrder: departments.length,
      active: true,
      // A new department starts able to work what is routed to it and nothing
      // more. Widening is a decision someone should make on purpose.
      permissions: ["requests.work"],
    });
    setDraft(BLANK);
    toast.success(`${name} added`);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
        <Eyebrow className="text-gold-700">Departments</Eyebrow>
        <h2 className="mt-2 text-xl text-ink">Teams and what they may do</h2>
        <p className="mt-1.5 text-sm text-stone-600">
          These appear when you add an employee, and they decide what that person
          sees once they have a login. Guest requests route themselves to the
          department that handles the category.
        </p>
      </section>

      {departments.map((department) => (
        <DepartmentCard
          key={department.id}
          department={department}
          headcount={employees.filter((e) => e.departmentId === department.id).length}
          onSave={saveDepartment}
          onDelete={deleteDepartment}
        />
      ))}

      <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12">
        <h2 className="text-xl text-ink">Add a department</h2>
        <hr className="rule-gold my-4" />
        <form onSubmit={add} className="grid gap-4 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="dept-name">Name</Label>
            <Input
              id="dept-name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Front desk"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dept-desc">What they do</Label>
            <Input
              id="dept-desc"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="Arrivals, departures and the phone."
            />
          </div>
          <Button type="submit">
            <Plus aria-hidden />
            Add
          </Button>
        </form>
      </section>
    </div>
  );
}

function DepartmentCard({
  department,
  headcount,
  onSave,
  onDelete,
}: {
  department: Department;
  headcount: number;
  onSave: (d: Partial<Department> & { id?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  const toggle = (key: PermissionKey, on: boolean) =>
    onSave({
      ...department,
      permissions: on
        ? [...department.permissions, key]
        : department.permissions.filter((p) => p !== key),
    });

  return (
    <section
      className={cn(
        "rounded-xl bg-white p-6 shadow-soft ring-1 ring-gold/12",
        !department.active && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-medium text-ink">{department.name}</h3>
          <p className="mt-0.5 text-sm text-stone-600">
            {department.description || "No description"}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-600">
            <Users2 className="size-3.5" aria-hidden />
            {headcount} {headcount === 1 ? "person" : "people"}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={department.active}
            onChange={(event) => onSave({ ...department, active: event.target.checked })}
            className="size-4 accent-[var(--color-clay)]"
          />
          {department.active ? "In use" : "Retired"}
        </label>
      </div>

      <hr className="rule-gold my-4" />

      <fieldset>
        <legend className="label-caps text-gold-700">What they may do</legend>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {PERMISSIONS.map((permission) => {
            const held = department.permissions.includes(permission.key);
            return (
              <li key={permission.key}>
                <label
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl p-3 ring-1 transition-all",
                    held ? "bg-gold/8 ring-gold/40" : "bg-sand-200/50 ring-transparent",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={held}
                    onChange={(event) => toggle(permission.key, event.target.checked)}
                    className="mt-0.5 size-4 accent-[var(--color-clay)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">
                      {permission.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-stone-600">
                      {permission.detail}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="mt-5">
        <JobTitlesEditor
          id={department.id}
          slug={department.slug}
          titles={department.designations}
          onChange={(designations) => onSave({ ...department, designations })}
        />
      </div>

      <div className="mt-5 flex justify-end">
        {confirmRemove ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (headcount > 0) {
                setConfirmRemove(false);
                return toast.error(`${headcount} people are still in ${department.name}`, {
                  description: "Move them first, or retire the department instead.",
                });
              }
              onDelete(department.id);
              toast.success(`${department.name} removed`);
            }}
          >
            <Trash2 aria-hidden />
            Yes, remove it
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-status-cancelled hover:bg-status-cancelled-bg"
            onClick={() => setConfirmRemove(true)}
          >
            <Trash2 aria-hidden />
            Remove department
          </Button>
        )}
      </div>
    </section>
  );
}
