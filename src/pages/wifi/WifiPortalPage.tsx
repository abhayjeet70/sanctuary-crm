import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/common/PasswordInput";
import { Logo, Photo } from "@/components/common";
import { photo } from "@/lib/assets";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/services/session";
import { fetchMyWifiAccess, wifiController } from "@/services/wifi/controller";
import type { MyWifiAccess, WifiDeviceType } from "@/services/wifi/types";

/**
 * The captive portal — the page a network controller sends a guest to when
 * they join the villa Wi-Fi.
 *
 * It uses the guest account they already have (email or Guest ID, one
 * password system), finds their stay on the server, and authorises the device.
 * A real controller appends the device's MAC and IP to the redirect
 * (`?mac=…&ip=…`); they are passed through untouched and never trusted to
 * choose a booking. Until a controller is connected, the success screen says
 * "access authorised", never "you are online".
 */
export default function WifiPortalPage() {
  const [params] = useSearchParams();
  const { session, signIn } = useSession();

  const device = useMemo(() => {
    const ua = navigator.userAgent;
    const type: WifiDeviceType = /iPhone|Android.+Mobile/.test(ua)
      ? "phone"
      : /iPad|Android/.test(ua)
        ? "tablet"
        : /Macintosh|Windows|Linux/.test(ua)
          ? "laptop"
          : "other";
    const name = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : "My device";
    return { type, name };
  }, []);

  const [who, setWho] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [deviceName, setDeviceName] = useState(device.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<MyWifiAccess | null>(null);
  const [done, setDone] = useState<{ expiresAt?: string } | null>(null);

  useEffect(() => {
    if (session?.role === "guest") void fetchMyWifiAccess().then(setAccess);
  }, [session]);

  const signInAndContinue = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!who.trim() || !password) return setError("Enter your email or Guest ID, and your password.");
    if (!agreed) return setError("Please accept the terms to continue.");
    setBusy(true);
    const { error: e } = await signIn(who.trim(), password);
    setBusy(false);
    if (e) setError("That doesn't match a guest account. Check the details on your booking voucher.");
  };

  const connect = async () => {
    if (!agreed) return setError("Please accept the terms to continue.");
    setBusy(true);
    setError(null);
    const r = await wifiController.authorizeDevice({
      deviceName: deviceName.trim() || device.name,
      deviceType: device.type,
      macAddress: params.get("mac") ?? undefined,
      ipAddress: params.get("ip") ?? undefined,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Could not authorise this device.");
    setDone({ expiresAt: r.expiresAt });
  };

  const staff = session && session.role !== "guest";

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-ink px-4 py-10 text-sand">
      <Photo src={photo.hills} alt="" className="absolute inset-0 size-full object-cover opacity-25" />
      <div className="relative w-full max-w-md rounded-2xl bg-sand p-6 text-ink shadow-deep ring-1 ring-gold/30 sm:p-8">
        <div className="text-center">
          <Logo variant="onLight" size="h-16" className="justify-center" />
          <p className="label-caps mt-4 text-gold-700">Guest Wi-Fi</p>
          <h1 className="display-caps mt-2 text-3xl">Welcome</h1>
          {access?.villaName && <p className="mt-1 text-stone-600">{access.villaName}</p>}
        </div>

        <hr className="rule-gold my-6" />

        {done ? (
          <div className="space-y-4 text-center" role="status">
            <CheckCircle2 className="mx-auto size-10 text-status-confirmed" aria-hidden />
            <p className="font-display text-2xl">Access authorised</p>
            <p className="text-sm text-stone-600">
              {deviceName} may use <strong>{access?.ssid}</strong>
              {done.expiresAt && <> until {formatDateTime(done.expiresAt)}</>}.
            </p>
            <p className="rounded-lg bg-sand-200/70 p-3 text-xs text-stone-600">
              Controller: Mock — your stay has authorised this device in our system. The network
              itself is not yet connected to it, so this page cannot confirm you are online.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/guest/amenities">Go to your stay</Link>
            </Button>
          </div>
        ) : staff ? (
          <p className="text-center text-sm text-stone-600">
            This page is for guests. You are signed in as staff.
          </p>
        ) : !session ? (
          <form className="space-y-4" onSubmit={signInAndContinue} noValidate>
            <p className="text-center text-sm text-stone-600">
              Continue with the guest account from your booking — your email, or the Guest ID you
              were given.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="wp-who">Email or Guest ID</Label>
              <Input id="wp-who" value={who} onChange={(e) => setWho(e.target.value)} autoComplete="username" placeholder="you@example.com or HOS-G…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wp-pw">Password</Label>
              <PasswordInput id="wp-pw" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <Terms agreed={agreed} setAgreed={setAgreed} />
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Continue with guest access
            </Button>
          </form>
        ) : !access ? (
          <p className="flex items-center justify-center gap-2 text-sm text-stone-600">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Finding your stay…
          </p>
        ) : access.state === "ready" || access.state === "authorized" ? (
          <div className="space-y-4">
            <p className="text-center text-sm text-stone-600">
              {access.villaName} · access until {access.expiresAt && formatDateTime(access.expiresAt)}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="wp-device">Name this device</Label>
              <Input id="wp-device" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
            </div>
            <Terms agreed={agreed} setAgreed={setAgreed} />
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <Button className="w-full" disabled={busy} onClick={() => void connect()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Wifi aria-hidden />}
              Continue
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <p className="font-display text-xl">
              {access.state === "not_yet" ? "Wi-Fi opens on arrival" : access.state === "expired" ? "Your access has ended" : "Wi-Fi isn't available"}
            </p>
            <p className="text-sm text-stone-600">
              {access.state === "not_yet" && access.opensAt
                ? `It opens on ${formatDateTime(access.opensAt)}.`
                : access.state === "expired"
                  ? "Access ended at check-out. Please speak to the front desk if you are staying on."
                  : "We couldn't find a stay that is live right now. The front desk can help."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function Terms({ agreed, setAgreed }: { agreed: boolean; setAgreed: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-xs leading-relaxed text-stone-600">
      <input
        type="checkbox"
        checked={agreed}
        onChange={(e) => setAgreed(e.target.checked)}
        className="mt-0.5 size-4 accent-[var(--color-clay)]"
      />
      <span>
        I agree to use the network lawfully and considerately. Access is for guests of this stay
        and ends at check-out. Devices may be disconnected for misuse.
      </span>
    </label>
  );
}
