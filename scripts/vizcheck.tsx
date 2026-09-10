import { renderToString } from "react-dom/server";
import { FinanceAnalysis } from "../src/pages/admin/reports/FinanceAnalysis";
import { OperatingStatement } from "../src/pages/admin/reports/OperatingStatement";
import type { RevenueRow } from "../src/services/domain";

const row = (o: Partial<RevenueRow> = {}): RevenueRow => ({
  checkIn: "2026-09-04", checkOut: "2026-09-07", createdAt: "2026-07-01T09:00:00Z",
  status: "completed", source: "website", villaId: "v1", customerId: "c1",
  nights: 3, roomCharge: 30000, surcharges: 2000, food: 4200, addOns: 0,
  discount: 1500, tax: 6246, total: 40946, paid: 40946, balance: 0, ...o,
});

const rows = [
  row(),
  row({ source: "goibibo", villaId: "v2", paid: 0, balance: 40946, checkOut: "2026-06-01" }),
  row({ source: "phone", villaId: "v3", status: "cancelled" }),
  row({ source: "whatsapp", villaId: "v1", food: 0, checkIn: "2026-10-02" }),
];

const taxes = [{ id: "t", name: "GST", rate: 0.18, kind: "gst" as const, active: true, sortOrder: 0 }];

const cases: [string, string][] = [
  ["FinanceAnalysis", renderToString(
    <FinanceAnalysis rows={rows} names={(_d, k) => k} />,
  )],
  ["OperatingStatement (with payroll)", renderToString(
    <OperatingStatement rows={rows} villas={3} days={120} months={4} monthlyPayroll={90000}
      taxes={taxes} legalName="Homes of Sanctuary" from="2026-06-01" to="2026-09-30"
      today="2026-09-10" />,
  )],
  ["OperatingStatement (no payroll)", renderToString(
    <OperatingStatement rows={rows} villas={3} days={120} months={4} monthlyPayroll={null}
      taxes={taxes} legalName="Homes of Sanctuary" from="2026-06-01" to="2026-09-30"
      today="2026-09-10" />,
  )],
  ["Empty period", renderToString(
    <OperatingStatement rows={[]} villas={3} days={0} months={0} monthlyPayroll={null}
      taxes={taxes} legalName="Homes of Sanctuary" from="2026-06-01" to="2026-06-01"
      today="2026-09-10" />,
  )],
];

let bad = 0;
for (const [name, html] of cases) {
  const problems: string[] = [];
  if (/NaN/.test(html)) problems.push("NaN");
  if (/undefined/.test(html)) problems.push("undefined");
  if (/Infinity/.test(html)) problems.push("Infinity");
  if (/₹\s*-/.test(html)) problems.push("negative money rendered raw");
  if (problems.length) { bad++; console.error(`  FAIL ${name}: ${problems.join(", ")}`); }
  else console.log(`  ok   ${name} (${html.length} bytes)`);
}

// The donut must actually draw arcs, not an empty ring.
const analysis = cases[0][1];
console.log("  donut arcs drawn:", (analysis.match(/<path/g) ?? []).length);
console.log("  bars drawn:      ", (analysis.match(/rounded-r-\[4px\]/g) ?? []).length);
process.exit(bad ? 1 : 0);
