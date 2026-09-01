import { useState } from "react";
import { FileWarning, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/common";

/**
 * Shows a payment receipt, with a click-to-enlarge view for reading a UTR off a
 * phone screenshot.
 *
 * Phase 2: `src` becomes a short-lived signed URL from the private
 * `payment-receipts` bucket. This component does not care where it came from.
 */
export function ReceiptViewer({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">(
    src ? "loading" : "error",
  );

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
          <img
            src={src}
            alt={alt}
            onLoad={() => setState("ready")}
            onError={() => setState("error")}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <span
            aria-hidden
            className="absolute right-2 bottom-2 flex items-center gap-1.5 rounded-lg bg-ink/80 px-2 py-1 text-xs text-sand opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
          >
            <Maximize2 className="size-3" />
            Enlarge
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <img src={src} alt={alt} className="max-h-[80vh] w-full rounded-lg object-contain" />
      </DialogContent>
    </Dialog>
  );
}
