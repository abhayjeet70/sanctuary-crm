import { GUEST_IDS_BUCKET, RECEIPTS_BUCKET, supabase } from "./client";

/**
 * The private buckets: payment receipts, and guest ID scans.
 *
 * Both hold documents that must never be reachable by URL — a receipt carries
 * bank details, an ID scan carries a passport number. So a stored path is not
 * something an <img> can render: upload returns a path, resolve turns a path
 * into a short-lived signed URL, and storage RLS decides whether it signs at
 * all.
 */

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

/** True for the fixture rows that still hold a whole URL rather than a path. */
const isAbsolute = (path: string) =>
  path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:");

/** Shared guards. Both buckets accept the same four types and the same 5 MB. */
function reject(file: File): string | null {
  if (!ACCEPTED_RECEIPT_TYPES.includes(file.type)) return "Send a JPG, PNG, WebP or PDF.";
  if (file.size > MAX_RECEIPT_BYTES) return "That file is larger than 5 MB.";
  return null;
}

/**
 * Upload a receipt for a booking.
 *
 * The path convention is `{booking_id}/{timestamp}.{ext}` — that first segment
 * is what the storage RLS policy checks ownership against, so it is not
 * cosmetic. Returns the path to store on the payment row.
 */
export async function uploadReceipt(
  bookingId: string,
  file: File,
): Promise<{ path: string | null; error: string | null }> {
  const bad = reject(file);
  if (bad) return { path: null, error: bad };

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${bookingId}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

/**
 * Upload a photo ID for a guest.
 *
 * Keyed on a folder the caller supplies rather than the customer id, because
 * reception photographs the ID while adding someone who has no id yet. The
 * bucket policy is management-only in both directions, so — unlike receipts —
 * the first path segment carries no authorisation meaning and does not need to.
 */
export async function uploadGuestId(
  folder: string,
  file: File,
): Promise<{ path: string | null; error: string | null }> {
  const bad = reject(file);
  if (bad) return { path: null, error: bad };

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${folder}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(GUEST_IDS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

/**
 * A signed URL for a stored file, valid for a few minutes.
 *
 * Storage RLS still applies, so this returns null for something the caller has
 * no business seeing. `download` asks the server for a Content-Disposition
 * header, which is what makes a link save the file instead of navigating to
 * it — the browser cannot be talked into that from our side of the origin.
 */
export async function resolveSignedUrl(
  bucket: string,
  path: string | undefined,
  { ttlSeconds = 300, download = false }: { ttlSeconds?: number; download?: boolean } = {},
): Promise<string | null> {
  if (!path) return null;
  if (isAbsolute(path)) return path;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, ttlSeconds, download ? { download: true } : undefined);

  if (error) return null;
  return data.signedUrl;
}

/** The receipts bucket, which is what almost every caller wants. */
export const resolveReceiptUrl = (
  path: string | undefined,
  ttlSeconds = 300,
): Promise<string | null> => resolveSignedUrl(RECEIPTS_BUCKET, path, { ttlSeconds });

/** The same receipt, but as a link that saves rather than opens. */
export const resolveReceiptDownloadUrl = (
  path: string | undefined,
): Promise<string | null> =>
  resolveSignedUrl(RECEIPTS_BUCKET, path, { ttlSeconds: 120, download: true });

/** A guest's ID scan. Null unless the viewer is management. */
export const resolveGuestIdUrl = (path: string | undefined): Promise<string | null> =>
  resolveSignedUrl(GUEST_IDS_BUCKET, path, { ttlSeconds: 300 });
