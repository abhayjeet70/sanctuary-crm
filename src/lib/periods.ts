import { toISODate } from "@/services/domain";

export interface Period {
  id: string;
  label: string;
  from: string;
  to: string;
}

/**
 * Ranges a property actually asks for, the financial year included.
 *
 * The order matters to callers that default to one by index: this month, last
 * month, financial year to date, then the rolling windows.
 */
export function periodPresets(today: string): Period[] {
  const d = new Date(`${today}T00:00:00`);
  const y = d.getFullYear();
  const back = (months: number) => toISODate(new Date(y, d.getMonth() - months, d.getDate()));
  // India runs April to March, which is what the GST return is filed against.
  const fyStart = new Date(d.getMonth() >= 3 ? y : y - 1, 3, 1);

  return [
    { id: "mtd", label: "This month", from: toISODate(new Date(y, d.getMonth(), 1)), to: today },
    {
      id: "last",
      label: "Last month",
      from: toISODate(new Date(y, d.getMonth() - 1, 1)),
      to: toISODate(new Date(y, d.getMonth(), 0)),
    },
    { id: "fy", label: "Financial year to date", from: toISODate(fyStart), to: today },
    { id: "3m", label: "Last 3 months", from: back(3), to: today },
    { id: "6m", label: "Last 6 months", from: back(6), to: today },
    { id: "12m", label: "Last 12 months", from: back(12), to: today },
  ];
}
