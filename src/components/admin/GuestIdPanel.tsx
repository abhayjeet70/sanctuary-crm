import { useEffect, useState } from "react";
import { Eye, FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Eyebrow } from "@/components/common";
import { resolveGuestIdUrl } from "@/services/supabase/receipts";
import type { Customer } from "@/types";

const LABEL: Record<string, string> = {
  aadhaar: "Aadhaar",
  passport: "Passport",
  driving_licence: "Driving licence",
  voter_id: "Voter ID",
  pan: "PAN",
  other: "Photo ID",
};

/**
 * The photo ID on file for a guest.
 *
 * The scan is behind a signed URL that lasts minutes and is refused outright
 * for anyone the storage policy does not recognise as management, so this
 * renders "not on file" for them rather than a broken image — which is the
 * truth from where they are standing.
 */
export function GuestIdPanel({ customer }: { customer: Customer }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!customer.idImagePath) {
      setUrl(null);
      return;
    }
    void resolveGuestIdUrl(customer.idImagePath).then((signed) => {
      if (active) setUrl(signed);
    });
    return () => {
      active = false;
    };
  }, [customer.idImagePath]);

  const has = Boolean(customer.idType || customer.idNumber || customer.idImagePath);

  return (
    <div>
      <Eyebrow className="mb-2">Identification</Eyebrow>

      {!has ? (
        <p className="flex items-center gap-2 text-sm text-stone-600">
          <ShieldAlert className="size-4 shrink-0 text-status-pending" aria-hidden />
          No ID on file. Record one before they check in.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <ShieldCheck className="size-4 shrink-0 text-status-confirmed" aria-hidden />
          <p className="text-sm text-ink">
            {LABEL[customer.idType ?? "other"] ?? "Photo ID"}
            {customer.idNumber && (
              <span className="ml-1.5 font-mono text-sm text-stone-600">
                {customer.idNumber}
              </span>
            )}
          </p>

          {customer.idImagePath &&
            (url ? (
              <Dialog>
                <DialogTrigger className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-clay-600 transition-colors hover:bg-sand-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                  <Eye className="size-3.5" aria-hidden />
                  View the scan
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogTitle className="sr-only">
                    Identity document for {customer.name}
                  </DialogTitle>
                  {url.includes(".pdf") ? (
                    <object
                      data={url}
                      type="application/pdf"
                      className="h-[70vh] w-full rounded-lg"
                    >
                      <p className="flex items-center gap-2 p-4 text-sm text-stone-600">
                        <FileText className="size-4" aria-hidden />
                        This browser will not display the PDF inline.
                      </p>
                    </object>
                  ) : (
                    <img
                      src={url}
                      alt={`Identity document on file for ${customer.name}`}
                      className="max-h-[70vh] w-full rounded-lg object-contain"
                    />
                  )}
                </DialogContent>
              </Dialog>
            ) : (
              <span className="ml-auto text-xs text-stone">Scan on file</span>
            ))}
        </div>
      )}
    </div>
  );
}
