import { RECEIPTS_BUCKET, supabase } from "./client";

/**
 * Payment receipts live in a private bucket, so a stored `receipt_path` is not
 * something an <img> can render. These two helpers are the whole contract:
 * upload returns a path, resolve turns a path into a short-lived signed URL.
 */

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

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
  if (!ACCEPTED_RECEIPT_TYPES.includes(file.type)) {
    return { path: null, error: "Send a JPG, PNG, WebP or PDF." };
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return { path: null, error: "That file is larger than 5 MB." };
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${bookingId}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

/**
 * A signed URL for a stored receipt, valid for a few minutes.
 *
 * Storage RLS still applies, so this returns null for a receipt the caller has
 * no business seeing. Legacy rows may hold a full URL rather than a path (the
 * fixture data did); those are passed through untouched.
 */
export async function resolveReceiptUrl(
  path: string | undefined,
  ttlSeconds = 300,
): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:")) {
    return path;
  }

  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, ttlSeconds);

  if (error) return null;
  return data.signedUrl;
}
