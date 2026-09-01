const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** ₹1,43,964 — Indian grouping, no paise. */
export const money = (value: number) => inr.format(Math.round(value));

/** ₹32,000 written compactly for dense tables. */
export const moneyShort = (value: number) =>
  value >= 100000
    ? `₹${(value / 100000).toFixed(value % 100000 === 0 ? 0 : 1)}L`
    : money(value);

const dayMonth = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeOnly = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export const formatDate = (iso: string) => fullDate.format(new Date(iso));
export const formatShortDate = (iso: string) => dayMonth.format(new Date(iso));
export const formatTime = (iso: string) => timeOnly.format(new Date(iso));
export const formatDateTime = (iso: string) =>
  `${dayMonth.format(new Date(iso))}, ${timeOnly.format(new Date(iso))}`;

/** "12 – 15 Sep 2026", collapsing the month when both dates share one. */
export function formatDateRange(from: string, to: string) {
  const a = new Date(from);
  const b = new Date(to);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const left = sameMonth ? String(a.getDate()) : dayMonth.format(a);
  return `${left} – ${dayMonth.format(b)} ${b.getFullYear()}`;
}

/** Whole nights between two ISO dates. */
export function nightsBetween(checkIn: string, checkOut: string) {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** "2 hours ago" / "in 3 days", relative to the fixture clock. */
export function relativeTime(iso: string, now: Date = new Date()) {
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diff = new Date(iso).getTime() - now.getTime();
  const mins = Math.round(diff / 60_000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
