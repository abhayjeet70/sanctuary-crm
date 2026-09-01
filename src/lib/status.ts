import type {
  BookingSource,
  BookingStatus,
  FoodOrderStatus,
  PaymentStatus,
  RequestPriority,
  RequestStatus,
} from "@/types";

/** Every status tone in the product resolves to one of these six earthy
 *  families. Colour is never the only signal — each badge also shows a label,
 *  and dense views pair the badge with a small glyph. */
export type Tone =
  | "pending"
  | "uploaded"
  | "confirmed"
  | "inhouse"
  | "cancelled"
  | "completed";

export const toneClasses: Record<Tone, string> = {
  pending: "bg-status-pending-bg text-status-pending",
  uploaded: "bg-status-uploaded-bg text-status-uploaded",
  confirmed: "bg-status-confirmed-bg text-status-confirmed",
  inhouse: "bg-status-inhouse-bg text-status-inhouse",
  cancelled: "bg-status-cancelled-bg text-status-cancelled",
  completed: "bg-status-completed-bg text-status-completed",
};

/** Solid fills, for calendar bars where a tinted background needs to read
 *  against photography and neighbouring bars. */
export const toneSolid: Record<Tone, string> = {
  pending: "bg-status-pending text-white",
  uploaded: "bg-status-uploaded text-white",
  confirmed: "bg-status-confirmed text-white",
  inhouse: "bg-status-inhouse text-white",
  cancelled: "bg-status-cancelled text-white",
  completed: "bg-status-completed text-white",
};

interface Descriptor<T extends string> {
  label: string;
  tone: Tone;
  value: T;
}

const descriptor = <T extends string>(
  map: Record<T, { label: string; tone: Tone }>,
) => ({
  map,
  get: (value: T): Descriptor<T> => ({ ...map[value], value }),
  all: (Object.keys(map) as T[]).map((value) => ({ ...map[value], value })),
});

export const bookingStatus = descriptor<BookingStatus>({
  inquiry: { label: "Inquiry", tone: "pending" },
  pending_payment: { label: "Pending payment", tone: "pending" },
  payment_uploaded: { label: "Payment uploaded", tone: "uploaded" },
  payment_approved: { label: "Payment approved", tone: "confirmed" },
  confirmed: { label: "Confirmed", tone: "confirmed" },
  checked_in: { label: "Checked in", tone: "inhouse" },
  in_house: { label: "In house", tone: "inhouse" },
  checked_out: { label: "Checked out", tone: "completed" },
  completed: { label: "Completed", tone: "completed" },
  cancelled: { label: "Cancelled", tone: "cancelled" },
  rejected: { label: "Rejected", tone: "cancelled" },
  no_show: { label: "No show", tone: "cancelled" },
});

export const paymentStatus = descriptor<PaymentStatus>({
  pending: { label: "Pending", tone: "pending" },
  uploaded: { label: "Uploaded", tone: "uploaded" },
  approved: { label: "Approved", tone: "confirmed" },
  rejected: { label: "Rejected", tone: "cancelled" },
  refunded: { label: "Refunded", tone: "completed" },
  partial: { label: "Part paid", tone: "pending" },
  paid: { label: "Paid in full", tone: "confirmed" },
});

export const foodOrderStatus = descriptor<FoodOrderStatus>({
  placed: { label: "Placed", tone: "pending" },
  confirmation_pending: { label: "Confirmation pending", tone: "pending" },
  confirmed: { label: "Confirmed", tone: "uploaded" },
  cooking: { label: "Cooking", tone: "inhouse" },
  ready: { label: "Ready", tone: "confirmed" },
  served: { label: "Served", tone: "confirmed" },
  billed: { label: "Billed", tone: "completed" },
  cancelled: { label: "Cancelled", tone: "cancelled" },
});

export const requestStatus = descriptor<RequestStatus>({
  pending: { label: "Pending", tone: "pending" },
  assigned: { label: "Assigned", tone: "uploaded" },
  in_progress: { label: "In progress", tone: "inhouse" },
  completed: { label: "Completed", tone: "confirmed" },
  rejected: { label: "Rejected", tone: "cancelled" },
});

export const requestPriority = descriptor<RequestPriority>({
  low: { label: "Low", tone: "completed" },
  normal: { label: "Normal", tone: "uploaded" },
  high: { label: "High", tone: "pending" },
  urgent: { label: "Urgent", tone: "cancelled" },
});

export const bookingSource: Record<BookingSource, string> = {
  website: "Website",
  phone: "Phone",
  whatsapp: "WhatsApp",
  goibibo: "Goibibo",
  walk_in: "Walk-in",
  referral: "Referral",
  other: "Other",
};

export const sourceOptions = Object.entries(bookingSource) as [BookingSource, string][];

/** The forward path a food order takes on the kitchen board. */
export const FOOD_PIPELINE: FoodOrderStatus[] = [
  "placed",
  "confirmation_pending",
  "confirmed",
  "cooking",
  "ready",
  "served",
  "billed",
];

export const titleCase = (value: string) =>
  value
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
