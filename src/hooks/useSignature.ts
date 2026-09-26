import { useEffect, useState } from "react";
import { resolveSignedUrl } from "@/services/supabase/receipts";
import { SIGNATURE } from "@/lib/signature";

/**
 * A viewable URL for the stored signature, or null when there is none.
 * Signed for an hour: long enough to read and print an invoice, short enough
 * that a copied link stops working.
 */
export function useSignatureUrl(path: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (!path) {
      setUrl(null);
      return;
    }
    void resolveSignedUrl(SIGNATURE.bucket, path, { ttlSeconds: 3600 }).then((u) => {
      if (live) setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [path]);

  return url;
}
