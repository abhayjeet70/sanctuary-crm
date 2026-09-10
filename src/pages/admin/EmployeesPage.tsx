import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, UserPlus, Users } from "lucide-react";
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
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/common";
import { EmployeeDialog } from "@/components/admin/EmployeeDialog";
import { StaffAccountPanel } from "@/components/admin/StaffAccountPanel";
import { useEmployeePay, useEmployees, useMockData } from "@/hooks/useData";
import { useSession, useShowsFinancials } from "@/services/session";
import { titleCase } from "@/lib/status";
import { formatDate, initials, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Employee, EmployeeStatus } from "@/types";

const ALL = "all";
const TEAMS = ["housekeeping", "kitchen", "maintenance", "manager"];

const STATUS_TONE: Record<EmployeeStatus, "confirmed" | "pending" | "cancelled"> = {
  active: "confirmed",
  on_leave: "pending",
  left: "cancelled",
};

/**
 * The roster.
 *
 * Read by management, changed by the owner — hiring, pay and handing out
 * logins are not a manager's to do. RLS is what enforces that; hiding the
 * buttons only avoids offering an action that would fail.
 */
export default function EmployeesPage() {
  const employees = useEmployees();
  const { session } = useSession();
  const isOwner = session?.role === "admin";

  const [search, setSearch] = useState("");
  const [team, setTeam] = useState(ALL);
  const [status, setStatus] = useState("working");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return employees
      .filter((e) => (team === ALL ? true : e.team === team))
      .filter((e) =>
        status === ALL
          ? true
          : status === "working"
            ? e.status !== "left"
            : e.status === status,
      )
      .filter((e) =>
        needle
          ? [e.fullName, e.designation, e.employeeCode, e.phone, e.email]
              .join(" ")
              .toLowerCase()
              .includes(needle)
          : true,
      )
      .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  }, [employees, search, team, status]);

  const working = employees.filter((e) => e.status !== "left");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${working.length} on the roster`}
        title="Employees"
        description="Who works here, what they do, and who can sign in."
        actions={
          isOwner && (
            <Button onClick={() => setAdding(true)}>
              <UserPlus aria-hidden />
              Add employee
            </Button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Working" value={working.length} icon={<Users className="size-4" />} />
        <StatCard
          label="On leave"
          value={employees.filter((e) => e.status === "on_leave").length}
          tone={employees.some((e) => e.status === "on_leave") ? "warn" : "default"}
        />
        <StatCard
          label="With a login"
          value={working.filter((e) => e.profileId).length}
          hint={`of ${working.length}`}
        />
      </div>

      <div className="grid gap-4 rounded-xl bg-white p-4 shadow-soft ring-1 ring-ink/[0.06] sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="employee-search">Search</Label>
          <div className="relative">
            <Search
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone"
              aria-hidden
            />
            <Input
              id="employee-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, code or designation"
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="employee-team">Team</Label>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger id="employee-team">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Every team</SelectItem>
              {TEAMS.map((value) => (
                <SelectItem key={value} value={value}>
                  {titleCase(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="employee-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="employee-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="working">Still working</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on_leave">On leave</SelectItem>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value={ALL}>Everyone</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="Nobody matches that"
          description="Try a name, an employee code, or clear the filters."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((employee) => (
            <EmployeeRow
              key={employee.id}
              employee={employee}
              isOwner={isOwner}
              open={openId === employee.id}
              onToggle={() => setOpenId(openId === employee.id ? null : employee.id)}
              onEdit={() => setEditing(employee)}
            />
          ))}
        </ul>
      )}

      {(adding || editing) && (
        <EmployeeDialog
          employee={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EmployeeRow({
  employee,
  isOwner,
  open,
  onToggle,
  onEdit,
}: {
  employee: Employee;
  isOwner: boolean;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const { deleteEmployee } = useMockData();
  const pay = useEmployeePay(employee.id);
  const showsPay = useShowsFinancials();
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <li
      className={cn(
        "rounded-2xl bg-white p-5 shadow-soft ring-1 transition-all",
        open ? "ring-gold/40" : "ring-ink/[0.06]",
        employee.status === "left" && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-sm font-semibold text-gold-700">
          {initials(employee.fullName)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-gold-700">{employee.employeeCode}</span>
            <p className="font-medium text-ink">{employee.fullName}</p>
            <StatusBadge
              label={titleCase(employee.status)}
              tone={STATUS_TONE[employee.status]}
            />
            {!employee.profileId && (
              <span className="rounded-full bg-sand-200 px-2 py-0.5 text-xs text-stone-600">
                No login
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-stone-600">
            {employee.designation || "No designation"}
            {employee.team && ` · ${titleCase(employee.team)}`}
            {` · ${titleCase(employee.employmentType)}`}
          </p>
          <p className="mt-0.5 text-xs text-stone-600">
            {[employee.phone, employee.email].filter(Boolean).join(" · ")}
            {employee.dateOfJoining && ` · joined ${formatDate(employee.dateOfJoining)}`}
            {showsPay && pay && ` · ${money(pay.monthlySalary)} a month`}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onToggle}>
            {open ? "Close" : "Open"}
          </Button>
          {isOwner && (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-5 space-y-4 border-t border-ink/8 pt-5">
          {(employee.address || employee.emergencyName || employee.notes) && (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              {employee.address && (
                <div>
                  <dt className="label-caps">Address</dt>
                  <dd className="mt-0.5 text-stone-600">{employee.address}</dd>
                </div>
              )}
              {employee.emergencyName && (
                <div>
                  <dt className="label-caps">In an emergency</dt>
                  <dd className="mt-0.5 text-stone-600">
                    {employee.emergencyName}
                    {employee.emergencyPhone && ` · ${employee.emergencyPhone}`}
                  </dd>
                </div>
              )}
              {employee.notes && (
                <div>
                  <dt className="label-caps">Notes</dt>
                  <dd className="mt-0.5 text-stone-600">{employee.notes}</dd>
                </div>
              )}
            </dl>
          )}

          {isOwner ? (
            <StaffAccountPanel employee={employee} />
          ) : (
            <p className="text-sm text-stone-600">
              Logins and pay are the owner&rsquo;s to manage.
            </p>
          )}

          {isOwner && (
            <div className="flex justify-end">
              {confirmRemove ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    deleteEmployee(employee.id);
                    toast.success(`${employee.fullName} removed from the roster`);
                  }}
                >
                  Yes, remove the record
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-status-cancelled hover:bg-status-cancelled-bg"
                  onClick={() => setConfirmRemove(true)}
                >
                  Remove from roster
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
