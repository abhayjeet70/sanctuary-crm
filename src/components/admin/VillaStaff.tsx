import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { Eyebrow, StatusBadge } from "@/components/common";
import { useDepartments, useEmployees, useRequestViews } from "@/hooks/useData";
import { initials } from "@/lib/format";
import type { Villa } from "@/types";

/**
 * Who works at this villa, and who is free right now.
 *
 * Floaters (staff with no villa set) are listed apart: they cover every house
 * but only pick up a villa's requests after that villa's own people.
 */
export function VillaStaff({ villa }: { villa: Villa }) {
  const employees = useEmployees().filter((e) => e.status !== "left");
  const departments = useDepartments();
  const requests = useRequestViews();

  const busy = (id: string) =>
    requests.some(
      (r) =>
        r.request.assignedEmployee === id &&
        (r.request.status === "assigned" || r.request.status === "in_progress"),
    );

  const own = employees.filter((e) => e.villaId === villa.id);
  const floaters = employees.filter((e) => !e.villaId);

  const Row = ({ id, name, dept, designation, status }: { id: string; name: string; dept?: string; designation: string; status: string }) => {
    const working = busy(id);
    return (
      <li className="flex items-center gap-3 py-2.5">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sand-200 text-[0.6875rem] font-semibold text-stone-600"
        >
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">{name}</span>
          <span className="block truncate text-xs text-stone-600">
            {[dept, designation].filter(Boolean).join(" · ")}
          </span>
        </span>
        {status === "on_leave" ? (
          <StatusBadge label="On leave" tone="pending" />
        ) : (
          <StatusBadge label={working ? "On a job" : "Free"} tone={working ? "inhouse" : "confirmed"} />
        )}
      </li>
    );
  };

  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-gold-700" aria-hidden />
          <Eyebrow className="text-gold-700">Staff at {villa.name}</Eyebrow>
        </div>
        <Link to="/admin/employees" className="text-xs text-clay-600 underline underline-offset-2">
          Manage employees
        </Link>
      </div>

      {own.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600">
          Nobody is registered at this villa yet. Choose it when adding or editing an employee.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-ink/8">
          {own.map((e) => (
            <Row
              key={e.id}
              id={e.id}
              name={e.fullName}
              dept={departments.find((d) => d.id === e.departmentId)?.name}
              designation={e.designation}
              status={e.status}
            />
          ))}
        </ul>
      )}

      {floaters.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-stone-600 hover:text-ink">
            {floaters.length} {floaters.length === 1 ? "person covers" : "people cover"} every villa
          </summary>
          <ul className="mt-1 divide-y divide-ink/8">
            {floaters.map((e) => (
              <Row
                key={e.id}
                id={e.id}
                name={e.fullName}
                dept={departments.find((d) => d.id === e.departmentId)?.name}
                designation={e.designation}
                status={e.status}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
