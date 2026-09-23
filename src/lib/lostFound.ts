import type { Tone } from "@/lib/status";
import { addDays } from "@/services/domain";
import type {
  CourierStatus,
  LostItem,
  LostItemCategory,
  LostItemDisposition,
  LostItemLocation,
  LostItemSensitivity,
  LostItemStatus,
} from "@/types";

/**
 * The words Lost & Found uses, in one place.
 *
 * The state machine itself is in the database — `lost_item_transition_allowed`
 * refuses an illegal step however it arrives. This file only says what each
 * state is called and how it is toned, so the desk, the housekeeper and the
 * guest read the same word for the same fact.
 */

export const CATEGORIES: Record<LostItemCategory, string> = {
  electronics: "Electronics",
  jewellery: "Jewellery",
  watch: "Watch",
  clothing: "Clothing",
  bag: "Bag",
  documents: "Documents / ID",
  medication: "Medication",
  cash: "Cash / cards",
  toiletries: "Toiletries",
  books: "Books",
  toys: "Toys",
  accessories: "Accessories",
  other: "Other",
};

export const LOCATIONS: Record<LostItemLocation, string> = {
  villa: "Villa",
  room: "Bedroom",
  common_area: "Common area",
  restaurant: "Dining",
  kitchen: "Kitchen",
  pool: "Pool",
  garden: "Garden",
  front_desk: "Front desk",
  parking: "Parking",
  other: "Elsewhere",
};

export const SENSITIVITY: Record<LostItemSensitivity, { label: string; hint: string }> = {
  normal: { label: "Ordinary", hint: "Clothes, chargers, books, toiletries" },
  high_value: { label: "High value", hint: "Jewellery, watches, electronics, cash" },
  sensitive: { label: "Sensitive", hint: "Passports, IDs, documents, medication" },
};

/**
 * Categories that are valuable or sensitive by their nature. The form
 * suggests the class from the category; staff can still raise it, and the
 * database secures anything above ordinary whatever the form said.
 */
export const SUGGESTED_SENSITIVITY: Partial<Record<LostItemCategory, LostItemSensitivity>> = {
  jewellery: "high_value",
  watch: "high_value",
  electronics: "high_value",
  cash: "high_value",
  documents: "sensitive",
  medication: "sensitive",
};

export const STATUS: Record<LostItemStatus, { label: string; tone: Tone }> = {
  found: { label: "Found", tone: "pending" },
  under_review: { label: "Under review", tone: "pending" },
  guest_identified: { label: "Guest identified", tone: "uploaded" },
  guest_contacted: { label: "Guest contacted", tone: "uploaded" },
  claim_pending: { label: "Claim to verify", tone: "pending" },
  claim_verified: { label: "Claim verified", tone: "confirmed" },
  claim_rejected: { label: "Claim rejected", tone: "cancelled" },
  return_method_selected: { label: "Return chosen", tone: "inhouse" },
  return_arranged: { label: "Return arranged", tone: "inhouse" },
  ready_for_pickup: { label: "Ready for pickup", tone: "inhouse" },
  in_transit: { label: "In transit", tone: "inhouse" },
  returned: { label: "Returned", tone: "confirmed" },
  unclaimed: { label: "Unclaimed", tone: "completed" },
  disposed: { label: "Disposed", tone: "completed" },
  closed: { label: "Closed", tone: "completed" },
};

export const COURIER: Record<CourierStatus, { label: string; tone: Tone }> = {
  quote_required: { label: "Quote required", tone: "pending" },
  awaiting_payment: { label: "Awaiting payment", tone: "pending" },
  ready_to_ship: { label: "Ready to ship", tone: "uploaded" },
  pickup_scheduled: { label: "Pickup scheduled", tone: "uploaded" },
  picked_up: { label: "Picked up", tone: "inhouse" },
  in_transit: { label: "In transit", tone: "inhouse" },
  out_for_delivery: { label: "Out for delivery", tone: "inhouse" },
  delivered: { label: "Delivered", tone: "confirmed" },
  delivery_failed: { label: "Delivery failed", tone: "cancelled" },
  returned_to_property: { label: "Back at the property", tone: "cancelled" },
};

export const DISPOSITIONS: Record<Exclude<LostItemDisposition, "returned">, string> = {
  donated: "Donated",
  disposed: "Disposed of",
  transferred: "Transferred",
  handed_to_authorities: "Handed to the authorities",
  other: "Other",
};

/**
 * The working lanes of the queue — each is a question the desk asks.
 * An item is in exactly one.
 */
export const LANES = [
  {
    key: "found",
    label: "Found",
    hint: "Logged, not yet tied to anyone",
    statuses: ["found", "under_review", "guest_identified"] as LostItemStatus[],
  },
  {
    key: "awaiting",
    label: "Awaiting guest",
    hint: "Told, waiting on an answer",
    statuses: ["guest_contacted", "claim_rejected"] as LostItemStatus[],
  },
  {
    key: "claims",
    label: "Claims",
    hint: "A guest says it is theirs",
    statuses: ["claim_pending"] as LostItemStatus[],
  },
  {
    key: "returns",
    label: "Return / courier",
    hint: "Confirmed, on its way back",
    statuses: [
      "claim_verified",
      "return_method_selected",
      "return_arranged",
      "ready_for_pickup",
      "in_transit",
    ] as LostItemStatus[],
  },
  {
    key: "done",
    label: "Completed",
    hint: "Back with its owner",
    statuses: ["returned", "closed"] as LostItemStatus[],
  },
  {
    key: "closed",
    label: "Unclaimed / disposed",
    hint: "Nobody came forward",
    statuses: ["unclaimed", "disposed"] as LostItemStatus[],
  },
] as const;

export type LaneKey = (typeof LANES)[number]["key"];

const OPEN: LostItemStatus[] = [
  "found",
  "under_review",
  "guest_identified",
  "guest_contacted",
  "claim_pending",
  "claim_verified",
  "claim_rejected",
  "return_method_selected",
  "return_arranged",
  "ready_for_pickup",
  "in_transit",
  "unclaimed",
];

export const isOpen = (item: Pick<LostItem, "status">) => OPEN.includes(item.status);

/**
 * Past its retention date and still on a shelf. Measured from the item's own
 * date — property policy, not a legal minimum — and only for items no one
 * has claimed, since a claimed item is waiting on the guest, not overdue.
 */
export function isOverdue(item: Pick<LostItem, "status" | "retentionUntil">, today: string) {
  if (!item.retentionUntil) return false;
  const waiting = ["found", "under_review", "guest_identified", "guest_contacted", "unclaimed"];
  return waiting.includes(item.status) && item.retentionUntil < today;
}

/** Due within the week — the reminder, before it becomes overdue. */
export function isDueSoon(item: Pick<LostItem, "status" | "retentionUntil">, today: string) {
  if (!item.retentionUntil || isOverdue(item, today)) return false;
  // Date arithmetic on the calendar date, not through toISOString(): in IST,
  // local midnight is the previous day in UTC, which made "this week" a day
  // short. addDays reads and writes local parts, so it is right in any zone.
  const limit = addDays(today, 7);
  const waiting = ["found", "under_review", "guest_identified", "guest_contacted", "unclaimed"];
  return waiting.includes(item.status) && item.retentionUntil <= limit;
}
