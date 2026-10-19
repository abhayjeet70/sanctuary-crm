/** Pure helpers, no Deno APIs, so `npm test` can exercise them from Node. */

export interface DayAvailability {
  room_type_id: string;
  day: string; // YYYY-MM-DD
  availability: number;
}

export interface AvailabilityRange {
  room_type_id: string;
  date_from: string;
  date_to: string; // inclusive, as Channex expects
  availability: number;
}

const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** 365 rows per unit become a handful of ranges: one ARI call, small payload. */
export function toRanges(rows: DayAvailability[]): AvailabilityRange[] {
  const sorted = [...rows].sort((a, b) =>
    a.room_type_id === b.room_type_id ? a.day.localeCompare(b.day) : a.room_type_id.localeCompare(b.room_type_id),
  );
  const out: AvailabilityRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (
      last &&
      last.room_type_id === r.room_type_id &&
      last.availability === r.availability &&
      nextDay(last.date_to) === r.day
    ) {
      last.date_to = r.day;
    } else {
      out.push({ room_type_id: r.room_type_id, date_from: r.day, date_to: r.day, availability: r.availability });
    }
  }
  return out;
}

/** Constant-time string compare, so a wrong token leaks nothing through timing. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
