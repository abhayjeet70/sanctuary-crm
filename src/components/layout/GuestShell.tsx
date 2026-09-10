import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarPlus,
  CalendarCheck,
  ChefHat,
  ChevronRight,
  ConciergeBell,
  Home,
  LogOut,
  MessageSquareQuote,
  Receipt,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/common";
import { cn } from "@/lib/utils";
import { useSession } from "@/services/session";
import { useNotifications, useMockData } from "@/hooks/useData";
import { formatDateTime } from "@/lib/format";
import type { AppNotification } from "@/types";

/** Mobile-first: the five things a guest actually does live in a thumb-reachable
 *  bottom bar. The full set appears as a rail once there is room for it. */
const PRIMARY = [
  { to: "/guest/dashboard", label: "Stay", icon: Home },
  { to: "/guest/food", label: "Food", icon: ChefHat },
  { to: "/guest/payment", label: "Payment", icon: Wallet },
  { to: "/guest/requests", label: "Requests", icon: ConciergeBell },
  { to: "/guest/amenities", label: "Villa", icon: Sparkles },
] as const;

const SECONDARY = [
  { to: "/guest/book", label: "Book a stay", icon: CalendarPlus },
  { to: "/guest/booking", label: "Booking details", icon: CalendarCheck },
  { to: "/guest/invoice", label: "Invoice", icon: Receipt },
  { to: "/guest/feedback", label: "Feedback", icon: MessageSquareQuote },
] as const;

/** Where a guest notification takes you. */
function guestDestinationFor(item: AppNotification): string {
  if (item.kind === "invoice") return "/guest/invoice";
  if (item.kind === "payment") return "/guest/payment";
  return "/guest/dashboard";
}

function GuestNotificationTray() {
  const notifications = useNotifications();
  const { markNotificationsRead } = useMockData();
  // Guests only see invoice & payment notifications
  const guestNotifs = notifications.filter((n) =>
    ["invoice", "payment"].includes(n.kind),
  );
  const unread = guestNotifs.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);

  const seen = useRef<Set<string> | null>(null);
  const [flash, setFlash] = useState<AppNotification | null>(null);

  useEffect(() => {
    const allIds = new Set(guestNotifs.map((n) => n.id));
    if (seen.current === null) {
      seen.current = allIds;
      return;
    }
    const fresh = guestNotifs.find((n) => !seen.current!.has(n.id));
    seen.current = allIds;
    if (fresh) setFlash(fresh);
  }, [guestNotifs]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  if (guestNotifs.length === 0) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) markNotificationsRead();
      }}
    >
      <div className="relative">
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative text-sand/70 hover:bg-sand/12 hover:text-sand"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          >
            <Bell aria-hidden />
            {unread > 0 && (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay-600 px-1 text-[0.625rem] leading-none font-semibold text-white tabular-nums ring-2 ring-ink"
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>
        </SheetTrigger>

        {flash && !open && (
          <div
            role="status"
            aria-live="polite"
            className="absolute top-full right-0 z-50 mt-2 w-[19rem] animate-flash-in rounded-xl bg-white p-3 text-left shadow-deep ring-1 ring-gold/25"
          >
            <span
              aria-hidden
              className="absolute -top-1 right-4 size-2 rotate-45 bg-white ring-1 ring-gold/25"
            />
            <div className="relative flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-clay" aria-hidden />
              <Link
                to={guestDestinationFor(flash)}
                onClick={() => setFlash(null)}
                className="min-w-0 flex-1"
              >
                <span className="block text-sm font-medium text-ink">{flash.title}</span>
                <span className="mt-0.5 block text-sm text-stone-600">{flash.detail}</span>
              </Link>
              <button
                type="button"
                onClick={() => setFlash(null)}
                aria-label="Dismiss"
                className="-mt-1 -mr-1 rounded-md p-1 text-stone hover:bg-sand-200 hover:text-ink"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
        )}
      </div>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>
        <div className="px-4">
          <ul className="mt-4 divide-y divide-ink/8">
            {guestNotifs.map((item) => (
              <li key={item.id}>
                <Link
                  to={guestDestinationFor(item)}
                  onClick={() => setOpen(false)}
                  className="-mx-2 flex items-start gap-2 rounded-lg px-2 py-3 transition-colors hover:bg-gold/8"
                >
                  {!item.read && (
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-clay" aria-hidden />
                  )}
                  <span className={cn("min-w-0 flex-1", item.read && "pl-3.5")}>
                    <span className="block text-sm font-medium text-ink">{item.title}</span>
                    <span className="mt-0.5 block text-sm text-stone-600">{item.detail}</span>
                    <span className="mt-1 block text-xs text-stone">
                      {formatDateTime(item.at)}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-stone" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function GuestShell() {
  const { session, signOut } = useSession();
  const navigate = useNavigate();

  const leave = () => {
    signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-dvh bg-sand pb-20 lg:pb-0">
      {/* The guest portal is the property's front door, so the mark leads —
          left, and tall enough to own the corner. It spans both rows of the
          header rather than sitting in a thin strip above them. */}
      <header className="bg-ink">
        <div className="mx-auto flex max-w-5xl items-stretch gap-5 px-5 sm:gap-8 sm:px-8">
          <Link
            to="/guest/dashboard"
            aria-label="Homes of Sanctuary — your stay"
            className="flex shrink-0 items-center py-3 transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
          >
            <Logo variant="onDark" size="h-16 sm:h-20 lg:h-24" />
          </Link>

          {/* Centred below lg, where the nav rail is hidden and `between`
              would strand the actions at the top over dead space. */}
          <div className="flex min-w-0 flex-1 flex-col justify-center lg:justify-between">
            <div className="flex items-center justify-end gap-2 py-2.5">
              <GuestNotificationTray />
              <Button
                variant="ghost"
                size="sm"
                className="text-sand/70 hover:bg-sand/12 hover:text-sand"
                onClick={leave}
              >
                <LogOut aria-hidden />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>

            {/* Desktop nav rail. `whitespace-nowrap` because "Book a stay" and
                "Booking details" were folding onto two lines and dragging the
                whole rail out of alignment. */}
            <nav
              aria-label="Guest portal"
              className="hidden justify-end gap-0.5 lg:flex"
            >
              {[...PRIMARY, ...SECONDARY].map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-1.5 rounded-t-lg px-2.5 py-2.5 text-[0.8125rem] whitespace-nowrap transition-colors",
                      isActive
                        ? "bg-sand text-ink"
                        : "text-sand/65 hover:bg-sand/10 hover:text-sand",
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl">
        <Outlet />
      </main>

      {/* Mobile bottom bar */}
      <nav
        aria-label="Guest portal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-gold/20 bg-white/95 backdrop-blur lg:hidden"
      >
        <ul className="mx-auto flex max-w-md">
          {PRIMARY.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[0.6875rem] transition-colors",
                    isActive ? "text-clay-600" : "text-stone-600 hover:text-ink",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full transition-colors",
                        isActive && "bg-clay/12",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <p className="sr-only">Signed in as {session?.name}</p>
    </div>
  );
}
