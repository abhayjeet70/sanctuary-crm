import { ShieldCheck, Users2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common";
import { DepartmentManager } from "./DepartmentManager";
import { useDepartments, useEmployees } from "@/hooks/useData";

/**
 * Who may see what.
 *
 * Permissions hang off departments rather than individuals — a new cook
 * inherits the kitchen's access by being put in the kitchen, which is how the
 * property already thinks about it. The editor itself is the same one the
 * settings page shows; this route just gives it a home of its own.
 */
export default function RolesPage() {
  const departments = useDepartments();
  const employees = useEmployees();
  const withoutLogin = employees.filter((e) => !e.profileId && e.status === "active");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Management"
        title="Roles & permissions"
        description="What each department may open. Access follows the department, so moving somebody moves their access with them."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Departments"
          value={departments.length}
          icon={<ShieldCheck className="size-4" />}
        />
        <StatCard
          label="Active"
          value={departments.filter((d) => d.active).length}
          hint="Switched on"
        />
        <StatCard
          label="Staff"
          value={employees.filter((e) => e.status === "active").length}
          icon={<Users2 className="size-4" />}
        />
        <StatCard
          label="Without a login"
          value={withoutLogin.length}
          hint="On the team, no access"
          tone={withoutLogin.length ? "warn" : "default"}
        />
      </div>

      <DepartmentManager />
    </div>
  );
}
