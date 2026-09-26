/**
 * What a signature image must be. One definition, read by the upload form and
 * quoted to the person uploading — the invoice-signature bucket enforces the
 * type and size again on its own (see 20260926100000_invoice_signature.sql).
 */
export const SIGNATURE = {
  bucket: "invoice-signature",
  types: ["image/png", "image/jpeg", "image/webp"] as string[],
  typeNames: "PNG, JPG or WebP",
  maxBytes: 1024 * 1024,
  minWidth: 300,
  minHeight: 100,
  maxWidth: 2000,
  maxHeight: 800,
  /** A signature is wider than it is tall; a square or portrait crop has
   *  usually caught a page, not a signature. */
  minAspect: 1.5,
  recommended: "600 × 200 px, PNG with a transparent background",
} as const;

/** Read an image's pixel size without leaving it in the page. */
export function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}

/** Everything wrong with a candidate file, in words. Empty means acceptable. */
export async function signatureProblems(file: File): Promise<string[]> {
  const out: string[] = [];
  if (!SIGNATURE.types.includes(file.type)) {
    out.push(`It must be a ${SIGNATURE.typeNames} file — this one is ${file.type || "an unknown type"}.`);
  }
  if (file.size > SIGNATURE.maxBytes) {
    out.push(`It must be 1 MB or smaller — this one is ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
  }
  if (out.length) return out;

  try {
    const { width, height } = await imageSize(file);
    if (width < SIGNATURE.minWidth || height < SIGNATURE.minHeight) {
      out.push(`It is too small (${width} × ${height}). At least ${SIGNATURE.minWidth} × ${SIGNATURE.minHeight} px, or it prints blurred.`);
    }
    if (width > SIGNATURE.maxWidth || height > SIGNATURE.maxHeight) {
      out.push(`It is too large (${width} × ${height}). At most ${SIGNATURE.maxWidth} × ${SIGNATURE.maxHeight} px.`);
    }
    if (width / height < SIGNATURE.minAspect) {
      out.push("It should be wider than tall — crop close around the signature.");
    }
  } catch (e) {
    out.push((e as Error).message);
  }
  return out;
}
