import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, KeyRound, ShieldOff, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/services/supabase/client";
import { useMockData } from "@/hooks/useData";
import type { Employee } from "@/types";

interface Result {
  email: string;
  password: string;
  role?: string;
}

/**
 * The portal login for one employee.
 *
 * The password is generated on the server and shown here exactly once: it is
 * never stored, because GoTrue keeps only a hash of it. Losing the slip means
 * issuing a new password, not looking the old one up — which is the correct
 * behaviour and worth saying on screen, so nobody hunts for it later.
 */
export function StaffAccountPanel({ employee }: { employee: Employee }) {
  const { refresh } = useMockData();
  const [busy, setBusy] = useState<string | null>(null);
  const [role, setRole] = useState<"staff" | "manager">("staff");
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const call = async (action: string) => {
    setBusy(action);
    const { data, error } = await supabase.functions.invoke("manage-staff", {
      body: { employeeId: employee.id, action, role },
    });
    setBusy(null);

    const failure =
      error?.message ?? (data as { error?: string } | null)?.error ?? null;
    if (failure) {
      return toast.error("Could not do that", { description: failure });
    }

    const payload = data as Result & { revoked?: boolean };
    await refresh();

    if (payload.revoked) {
      toast.success(`${employee.fullName} can no longer sign in`);
      return;
    }
    setResult({ email: payload.email, password: payload.password, role: payload.role });
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        `Homes of Sanctuary portal\n${result.email}\n${result.password}`,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("Sign-in details copied");
    } catch {
      toast.error("Could not copy — select the text and copy it manually");
    }
  };

  const hasLogin = Boolean(employee.profileId);

  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
      <p className="label-caps text-gold-700">Portal login</p>
      <p className="mt-2 text-sm text-stone-600">
        {hasLogin
          ? `${employee.fullName} can sign in with ${employee.email}.`
          : employee.email
            ? "No account yet. Creating one generates a password to hand over."
            : "Add an email address to this employee before creating a login."}
      </p>
      <hr className="rule-gold my-4" />

      <div className="flex flex-wrap items-end gap-3">
        {!hasLogin && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="staff-role">Access</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "staff" | "manager")}>
                <SelectTrigger id="staff-role" className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff — their team's queue</SelectItem>
                  <SelectItem value="manager">Manager — operations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!employee.email || busy !== null}
              onClick={() => void call("create_account")}
            >
              <UserPlus aria-hidden />
              {busy === "create_account" ? "Creating…" : "Create login"}
            </Button>
          </>
        )}

        {hasLogin && (
          <>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void call("reset_password")}
            >
              <KeyRound aria-hidden />
              {busy === "reset_password" ? "Generating…" : "Generate new password"}
            </Button>
            {confirmRevoke ? (
              <Button
                variant="destructive"
                disabled={busy !== null}
                onClick={() => {
                  setConfirmRevoke(false);
                  void call("revoke_account");
                }}
              >
                <ShieldOff aria-hidden />
                Yes, block sign-in
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="text-status-cancelled hover:bg-status-cancelled-bg"
                onClick={() => setConfirmRevoke(true)}
              >
                <ShieldOff aria-hidden />
                Revoke access
              </Button>
            )}
          </>
        )}
      </div>

      {hasLogin && (
        <p className="mt-3 text-xs leading-relaxed text-stone-600">
          Revoking blocks sign-in without deleting the account, so their name stays on
          the requests and orders they handled.
        </p>
      )}

      {/* Shown once. There is no second chance to read it, by design. */}
      <Dialog open={result !== null} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign-in details for {employee.fullName}</DialogTitle>
            <DialogDescription>
              Give these to them now. The password is not stored anywhere and cannot be
              shown again — if it is lost, generate another.
            </DialogDescription>
          </DialogHeader>

          <dl className="mt-4 space-y-3 rounded-xl bg-sand-200/60 p-4">
            <div>
              <dt className="label-caps">Email</dt>
              <dd className="mt-0.5 font-mono text-sm break-all text-ink">{result?.email}</dd>
            </div>
            <div>
              <dt className="label-caps">Password</dt>
              <dd className="mt-0.5 font-mono text-lg tracking-wide text-ink">
                {result?.password}
              </dd>
            </div>
          </dl>

          <DialogFooter className="mt-5">
            <Button variant="outline" onClick={() => void copy()}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              Copy both
            </Button>
            <Button onClick={() => setResult(null)}>Done — I have given it to them</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
