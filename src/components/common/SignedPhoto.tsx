import { useEffect, useState } from "react";
import { Photo } from "./Photo";
import { resolveLostFoundUrl } from "@/services/supabase/receipts";

/**
 * A photograph from a private bucket.
 *
 * A stored path is not something an <img> can show — it becomes one through a
 * short-lived signature, and storage RLS decides whether it signs at all. So a
 * guest looking at an item that is not theirs gets the ordinary fallback
 * panel, not an error and not somebody else's photograph.
 */
export function SignedPhoto({
  path,
  alt,
  className,
}: {
  path?: string;
  alt: string;
  className?: string;
}) {
  const [resolved, setResolved] = useState<{ path?: string; url: string | null }>({
    url: null,
  });

  useEffect(() => {
    let live = true;
    if (!path) return;
    void resolveLostFoundUrl(path).then((url) => {
      if (live) setResolved({ path, url });
    });
    return () => {
      live = false;
    };
  }, [path]);

  // Only the signature for *this* path counts — a stale one from the previous
  // photo must never show under a new item's title.
  const url = resolved.path === path ? resolved.url : null;
  return <Photo src={url ?? undefined} alt={alt} className={className} />;
}
