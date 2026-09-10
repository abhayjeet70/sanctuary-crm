import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/common";
import { photo, video } from "@/lib/assets";
import { cn } from "@/lib/utils";

/** Once per browser session. A welcome that plays on every reload stops being
 *  a welcome and starts being a toll gate. */
const SEEN_KEY = "sanctuary.welcomed";

/** How long the reel holds before it lets go of its own accord. */
const HOLD_MS = 5200;

/** Whether the visitor has asked for less movement. Read at call time, not at
 *  module load — the setting can change while a tab is open. */
const wantsStillness = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function alreadyWelcomed() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Private windows and locked-down browsers throw on access. Showing the
    // welcome is the harmless side of that failure.
    return false;
  }
}

/**
 * The welcome reel, before the sign-in page.
 *
 * The property's own film, the mark, and a line of greeting — then it lifts
 * away to reveal the door. It is deliberately *over* the login page rather
 * than before it: the page beneath is already mounted and laid out, so the
 * reveal is a veil lifting off a finished room rather than a second load.
 *
 * Three things it refuses to do:
 *
 *   - Block. The mark and the greeting are on screen immediately; the film
 *     fades in behind them only once it can actually play. On a slow
 *     connection a visitor sees a composed still, never a black rectangle.
 *   - Insist. Click, key, scroll or wait — any of them opens it, and it never
 *     appears twice in a session.
 *   - Move, for anyone who asked it not to. Reduced motion gets the poster
 *     frame, no autoplay, and an instant lift.
 */
export function WelcomeGate({ onDone }: { onDone?: () => void }) {
  // Read once, on the first render, so the gate never flashes for someone who
  // has already been through it this session.
  const [state, setState] = useState<"showing" | "leaving" | "gone">(() =>
    alreadyWelcomed() ? "gone" : "showing",
  );
  const [filmReady, setFilmReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const dismiss = useCallback(() => {
    setState((current) => (current === "showing" ? "leaving" : current));
  }, []);

  // Anything the visitor does means "yes, I have seen it".
  useEffect(() => {
    if (state !== "showing") return;

    const hold = window.setTimeout(dismiss, wantsStillness() ? 1200 : HOLD_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") dismiss();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", dismiss, { passive: true, once: true });
    window.addEventListener("touchstart", dismiss, { passive: true, once: true });

    return () => {
      window.clearTimeout(hold);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", dismiss);
      window.removeEventListener("touchstart", dismiss);
    };
  }, [state, dismiss]);

  useEffect(() => {
    if (state !== "leaving") return;
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Not being able to remember is not a reason to refuse to open.
    }
    // Matches the veil-out duration; the node leaves the tree afterwards so it
    // cannot trap focus or swallow a click.
    const timer = window.setTimeout(() => {
      setState("gone");
      onDone?.();
    }, wantsStillness() ? 60 : 900);
    return () => window.clearTimeout(timer);
  }, [state, onDone]);

  // Autoplay is refused in more browsers than people expect, and a paused
  // first frame is a perfectly good still — so a rejection is not an error.
  useEffect(() => {
    if (state !== "showing" || wantsStillness()) return;
    void videoRef.current?.play().catch(() => setFilmReady(false));
  }, [state]);

  if (state === "gone") return null;

  return (
    <div
      // A live region would announce the greeting over whatever a screen
      // reader was already saying. It is decorative; the login form beneath
      // is the page's real content and is reachable the moment this lifts.
      aria-hidden
      onClick={dismiss}
      className={cn(
        "fixed inset-0 z-[100] flex cursor-pointer items-center justify-center overflow-hidden bg-ink",
        state === "leaving" && "animate-veil-out pointer-events-none",
      )}
    >
      {/* The film. Poster first so there is never a black hole while it
          buffers, and it only becomes visible once it is genuinely playing. */}
      {!wantsStillness() && (
        <video
          ref={videoRef}
          src={video.welcome}
          poster={photo.hills}
          muted
          loop
          playsInline
          preload="auto"
          onPlaying={() => setFilmReady(true)}
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-[1400ms] ease-out",
            filmReady ? "opacity-55" : "opacity-0",
          )}
        />
      )}

      {/* The still underneath, which is what a slow connection or a refused
          autoplay actually shows. */}
      <img
        src={photo.hills}
        alt=""
        className={cn(
          "absolute inset-0 size-full scale-105 object-cover transition-opacity duration-[1400ms]",
          filmReady ? "opacity-0" : "opacity-40",
        )}
      />

      {/* Two washes: ink for legibility, brass for warmth. The same pair the
          sign-in page uses, so the transition is one room, not two. */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink/85 via-ink/60 to-ink/95" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(201,169,97,0.20),transparent_62%)]" />
      {/* A vignette, so the centre reads as the lit part of the room. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(20,39,49,0.55)_100%)]" />

      <div className="relative flex flex-col items-center px-6 text-center">
        <span className="animate-rise-in block [animation-delay:120ms]">
          <Logo variant="onDark" size="h-28 sm:h-36" />
        </span>

        <hr className="rule-gold animate-hairline mt-8 w-40 [animation-delay:520ms] sm:w-56" />

        <p className="animate-rise-in mt-8 text-[0.6875rem] font-semibold tracking-[0.34em] text-gold-400 uppercase [animation-delay:640ms]">
          Welcome
        </p>

        <h1 className="display-caps animate-rise-in mt-4 max-w-3xl text-[2rem] leading-[1.05] text-white [animation-delay:760ms] sm:text-[3.25rem]">
          You are expected
          <br />
          <span className="text-gold-gradient">at Homes of Sanctuary.</span>
        </h1>

        <p className="animate-rise-in mt-6 max-w-md text-sm leading-relaxed text-sand/75 [animation-delay:900ms] sm:text-base">
          Three houses above the Nandi Hills escarpment, and everything that
          happens between an enquiry and a goodbye.
        </p>

        <button
          type="button"
          onClick={dismiss}
          tabIndex={-1}
          className="animate-rise-in mt-12 flex flex-col items-center gap-2 text-[0.625rem] font-semibold tracking-[0.24em] text-sand/45 uppercase transition-colors hover:text-gold-400 [animation-delay:1080ms]"
        >
          Enter
          <span aria-hidden className="h-8 w-px bg-gradient-to-b from-gold/70 to-transparent" />
        </button>
      </div>
    </div>
  );
}

/** True when the reel would show, so the page beneath can hold its own
 *  entrance animation back rather than playing it to an empty room. */
export const welcomePending = () => !alreadyWelcomed();
