import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useMockData, useSettings } from "@/hooks/useData";
import { useSignatureUrl } from "@/hooks/useSignature";
import { useSession } from "@/services/session";
import { supabase } from "@/services/supabase/client";
import { SIGNATURE, signatureProblems } from "@/lib/signature";

/**
 * The image printed above "Authorised signatory" on every invoice.
 *
 * Saved the moment it uploads (like a villa photo), not with the page's Save
 * button — a picture is not a draft. The owner alone may change it: the bucket
 * and a database trigger both refuse anyone else, so the controls simply are
 * not offered to a manager.
 */
export function SignatureUpload() {
  const settings = useSettings();
  const { updateSettings } = useMockData();
  const isOwner = useSession().session?.role === "admin";
  const url = useSignatureUrl(settings?.signaturePath || undefined);

  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const previous = settings?.signaturePath ?? "";

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setProblems([]);
    const found = await signatureProblems(file);
    if (found.length) return setProblems(found);

    setBusy(true);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `signature/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from(SIGNATURE.bucket)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      setBusy(false);
      return setProblems([error.message]);
    }
    updateSettings({ signaturePath: path });
    // The old file is no longer referenced by anything.
    if (previous) void supabase.storage.from(SIGNATURE.bucket).remove([previous]);
    setBusy(false);
    toast.success("Signature updated", { description: "It appears on every invoice from now on." });
  };

  const remove = async () => {
    setBusy(true);
    updateSettings({ signaturePath: "" });
    if (previous) await supabase.storage.from(SIGNATURE.bucket).remove([previous]);
    setBusy(false);
    toast.success("Signature removed", { description: "Invoices print the signatory's name only." });
  };

  return (
    <div className="mt-4 space-y-3">
      <Label htmlFor="signature-file">Signature image</Label>

      <div className="flex flex-wrap items-start gap-5">
        <div
          className="flex h-24 w-56 items-center justify-center rounded-lg border border-dashed border-ink/25 bg-white p-2"
          aria-label="Current signature"
        >
          {url ? (
            <img src={url} alt="The current signature" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-stone-600">No signature uploaded</span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2 text-xs leading-relaxed text-stone-600">
          <p className="font-medium text-ink">What works</p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>Format: {SIGNATURE.typeNames}</li>
            <li>Size: up to 1 MB</li>
            <li>
              Dimensions: {SIGNATURE.minWidth} × {SIGNATURE.minHeight} px at least,{" "}
              {SIGNATURE.maxWidth} × {SIGNATURE.maxHeight} px at most, wider than it is tall
            </li>
            <li>Best: {SIGNATURE.recommended}, cropped close around the signature</li>
          </ul>
        </div>
      </div>

      {isOwner ? (
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            id="signature-file"
            type="file"
            accept={SIGNATURE.types.join(",")}
            className="sr-only"
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            <ImagePlus aria-hidden />
            {busy ? "Uploading…" : previous ? "Replace signature" : "Upload signature"}
          </Button>
          {previous && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              className="text-danger hover:bg-danger-bg hover:text-danger-700"
              onClick={() => void remove()}
            >
              <Trash2 aria-hidden />
              Remove
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-stone-600">Only the owner can change the signature.</p>
      )}

      {problems.length > 0 && (
        <div role="alert" className="rounded-lg bg-status-cancelled-bg p-3 text-sm text-ink">
          <p className="font-medium">That image can't be used:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
