import { useEffect, useState } from "react";
import { Download, FileText, FileWarning, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/common";
import { resolveReceiptDownloadUrl, resolveReceiptUrl } from "@/services/supabase/receipts";

/**
 * Shows a payment receipt, with click-to-enlarge for reading a UTR off a phone
 * screenshot.
 *
 * `src` is a storage PATH, not a URL — the `payment-receipts` bucket is private
 * because receipts carry bank details. This resolves it to a short-lived signed
 * URL on mount, and storage RLS means a path the viewer has no right to see
 * simply fails to sign.
 */
export function ReceiptViewer({
  src,
  alt,
  className,
  downloadName,
  showDownload = true,
}: {
  src?: string;
  alt: string;
  className?: string;
  /** What the saved file is called. Defaults to the stored filename. */
  downloadName?: string;
  showDownload?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">(
    src ? "loading" : "error",
  );

  useEffect(() => {
    let active = true;
    if (!src) {
      setState("error");
      return;
    }
    setState("loading");

    // Two signatures, because a link that saves needs the server to send a
    // Content-Disposition header. The viewer sandbox ignores `<a download>` on
    // a cross-origin href, so asking Storage for it is the only way that works.
    void resolveReceiptDownloadUrl(src).then((resolved) => {
      if (active) setDownloadUrl(resolved);
    });

    void resolveReceiptUrl(src).then((resolved) => {
      if (!active) return;
      if (!resolved) {
        setState("error");
        return;
      }
      setUrl(resolved);
      // A PDF has nothing to decode, so it is ready as soon as it is signed.
      if (resolved.includes(".pdf")) setState("ready");
    });

    return () => {
      active = false;
    };
  }, [src]);

  if (!src || state === "error") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl bg-status-cancelled-bg p-8 text-center",
          className,
        )}
        role="alert"
      >
        <FileWarning className="size-6 text-status-cancelled" aria-hidden />
        <p className="text-sm font-medium text-ink">Receipt unavailable</p>
        <p className="text-xs text-status-cancelled">
          Ask the guest to upload it again before approving.
        </p>
      </div>
    );
  }

  const isPdf = url?.includes(".pdf");
  // The stored name is `{booking}/{timestamp}.{ext}`; the last segment is what
  // a person would recognise in their downloads folder.
  const suggestedName = downloadName ?? src.split("/").pop() ?? "receipt";

  const download = showDownload && downloadUrl && (
    <a
      href={downloadUrl}
      download={suggestedName}
      className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-clay-600 underline-offset-4 transition-colors hover:bg-sand-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <Download className="size-3.5" aria-hidden />
      Download receipt
      <span className="sr-only"> — {alt}</span>
    </a>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "group relative block w-full overflow-hidden rounded-xl bg-sand-200 ring-1 ring-gold/20 transition-all hover:ring-gold/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
            className,
          )}
          aria-label="Enlarge receipt"
        >
          {state === "loading" && <Skeleton className="absolute inset-0 rounded-xl" />}

          {url && isPdf ? (
            <span className="flex h-full min-h-32 flex-col items-center justify-center gap-2 p-6 text-stone-600">
              <FileText className="size-8 text-gold-700" aria-hidden />
              <span className="text-xs">PDF receipt — open to read</span>
            </span>
          ) : (
            url && (
              <img
                src={url}
                alt={alt}
                onLoad={() => setState("ready")}
                onError={() => setState("error")}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            )
          )}

          <span
            aria-hidden
            className="absolute right-2 bottom-2 flex items-center gap-1.5 rounded-lg bg-ink/80 px-2 py-1 text-xs text-sand opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
          >
            <Maximize2 className="size-3" />
            Enlarge
          </span>
        </button>
      </DialogTrigger>

      {download}

      <DialogContent className="max-w-3xl">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {url && isPdf ? (
          <object data={url} type="application/pdf" className="h-[80vh] w-full rounded-lg">
            <a href={url} target="_blank" rel="noreferrer" className="text-clay-600 underline">
              Open the receipt in a new tab
            </a>
          </object>
        ) : (
          url && (
            <img src={url} alt={alt} className="max-h-[80vh] w-full rounded-lg object-contain" />
          )
        )}
        {download}
      </DialogContent>
    </Dialog>
  );
}
