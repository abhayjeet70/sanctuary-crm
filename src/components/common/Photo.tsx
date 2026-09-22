import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A photograph that cannot leave a broken-image icon on the page.
 *
 * Every villa and dish here is a remote URL, and remote URLs fail — the host
 * rate-limits, the seed row points at something that has gone, the guest is on
 * hotel wifi. The browser's default answer to that is a torn-paper glyph and
 * the alt text, which on a hospitality surface reads as a broken product.
 *
 * So a failure falls back to a warm sand panel carrying the subject's initial.
 * It is quiet, it fills the same box, and nothing reflows.
 */
export function Photo({
  src,
  alt,
  className,
  /** Drawn in the fallback panel. Defaults to the first letter of `alt`. */
  label,
  loading = "lazy",
}: {
  src?: string;
  alt: string;
  className?: string;
  label?: string;
  loading?: "lazy" | "eager";
}) {
  // The URL that failed, rather than a boolean: the same <Photo> is reused as
  // a list filters, and a new src deserves its own attempt instead of
  // inheriting the last one's failure.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src) && failedSrc === src;

  if (!src || failed) {
    const initial = (label ?? alt).trim().charAt(0).toUpperCase();
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-sand-200 text-stone",
          className,
        )}
        // A decorative photo stays decorative when it fails: announcing
        // "Villa Maaya" from a placeholder the sighted user reads as empty
        // would describe something that is not there.
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        {initial ? (
          <span className="font-display text-2xl text-stone-600 select-none" aria-hidden>
            {initial}
          </span>
        ) : (
          <ImageOff className="size-5" aria-hidden />
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      className={className}
      onError={() => setFailedSrc(src ?? null)}
    />
  );
}
