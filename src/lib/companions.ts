import type { Tone } from "@/lib/status";
import type { Booking, BookingCompanion, CompanionAccess, CompanionRelationship } from "@/types";

export const RELATIONSHIPS: Record<CompanionRelationship, string> = {
  family: "Family",
  friend: "Friend",
  colleague: "Colleague",
  child: "Child",
  other: "Other",
};

export const ACCESS: Record<CompanionAccess, { label: string; tone: Tone }> = {
  active: { label: "Portal active", tone: "confirmed" },
  revoked: { label: "Revoked", tone: "cancelled" },
  expired: { label: "Stay ended", tone: "completed" },
};

/** Hours after the agreed departure that access survives. Mirrors the
 *  `interval '3 hours'` in companion_access_is_live — change both or neither. */
const GRACE_HOURS = 3;

/**
 * Where a companion's access stands, worked out the same way the database
 * works it out.
 *
 * This is for display only. The database decides, in
 * `companion_access_is_live`, and it is the one that refuses a request — so if
 * the two ever disagree, the badge is wrong and the guest is still locked out,
 * which is the safe way round.
 *
 * Revoked is a fact that was recorded. Expired is a clock: the stay's agreed
 * departure, not whether anybody pressed "checked out".
 */
export function companionAccess(
  companion: BookingCompanion,
  booking: Pick<Booking, "status" | "checkOut" | "checkOutTime">,
  now: Date = new Date(),
): CompanionAccess {
  if (companion.revokedAt) return "revoked";
  if (["cancelled", "rejected", "no_show"].includes(booking.status)) return "expired";

  // The departure hour in IST, as a real instant.
  const time = booking.checkOutTime ?? "11:00";
  const ends = new Date(`${booking.checkOut}T${time}:00+05:30`);
  ends.setHours(ends.getHours() + GRACE_HOURS);
  return now < ends ? "active" : "expired";
}
