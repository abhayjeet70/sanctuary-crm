import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Home,
  LogOut,
  MessageSquareQuote,
  Receipt,
  Settings,
  Users,
  Users2,
  TrendingUp,
  Wallet,
  Menu as MenuIcon,
  ChevronRight,
  X,
  Building2,
  BookOpen,
  ConciergeBell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/common";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { useMockData, useNotifications, usePaymentVerificationQueue } from "@/hooks/useData";
import { useSession } from "@/services/session";
import { firstUnannounced } from "@/services/domain";
import type { AppNotification, Role } from "@/types";
import { initials } from "@/lib/format";

/**
 * The sections, in three groups.
 *
 * Fourteen identical rows in one column is a wall — nothing to aim at, and
 * every item costs the same glance. Grouping by what the person is doing gives
 * the eye three targets instead of fourteen, and it costs almost no height
 * because the rows themselves get tighter in exchange.
 */
const NAV = [
  {
    label: "Today",
    items: [
      { to: "/admin/dashboard", label: "Dashboard", icon: Home },
      { to: "/admin/frontdesk", label: "Front desk", icon: ConciergeBell },
      { to: "/admin/bookings", label: "Bookings", icon: BookOpen },
      { to: "/admin/payments", label: "Payments", icon: Wallet, badge: true },
      { to: "/admin/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Property",
    items: [
      { to: "/admin/villas", label: "Villas", icon: Building2 },
      { to: "/admin/customers", label: "Guests", icon: Users },
      { to: "/admin/food", label: "Kitchen", icon: ChefHat },
      { to: "/admin/requests", label: "Requests", icon: ClipboardList },
      { to: "/admin/feedback", label: "Feedback", icon: MessageSquareQuote },
    ],
  },
  {
    label: "Business",
    items: [
      { to: "/admin/invoices", label: "Invoices", icon: Receipt },
      { to: "/admin/reports", label: "Finances", icon: TrendingUp, ownerOnly: true },
      { to: "/admin/employees", label: "Employees", icon: Users2, ownerOnly: true },
      // Configuration belongs to the owner. RLS refuses a manager's write
      // either way; hiding the page keeps the UI from offering something that
      // will fail.
      { to: "/admin/settings", label: "Settings", icon: Settings, ownerOnly: true },
    ],
  },
] as const;

/** How each role is described under their name. The footer used to say
 *  "Owner" to everybody, including a manager, which is simply untrue. */
const ROLE_LABEL: Record<Role, string> = {
  admin: "Owner",
  manager: "Manager",
  staff: "Team",
  guest: "Guest",
};

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const queue = usePaymentVerificationQueue();
  const { session } = useSession();
  const isOwner = session?.role === "admin";

  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-4">
      {NAV.map((group) => {
        const items = group.items.filter(
          (item) => isOwner || !("ownerOnly" in item && item.ownerOnly),
        );
        if (items.length === 0) return null;

        return (
          <div key={group.label}>
            <p className="px-2.5 pb-1 text-[0.5625rem] font-semibold tracking-[0.16em] text-sand/30 uppercase">
              {group.label}
            </p>
            <ul className="flex flex-col gap-px">
              {items.map(({ to, label, icon: Icon, ...rest }) => {
                const count = "badge" in rest && rest.badge ? queue.length : 0;
                return (
                  <li key={to}>
                    <NavLink
                      to={to}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "group relative flex items-center gap-2.5 rounded-lg py-1.5 pr-2 pl-3 text-[0.8125rem] transition-all duration-150",
                          isActive
                            ? "bg-gold/[0.09] text-sand ring-1 ring-gold/20"
                            : "text-sand/55 hover:bg-white/[0.05] hover:text-sand/90",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* Gold accent rail — wider + taller when active */}
                          {isActive && (
                            <span
                              aria-hidden
                              className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 bg-gold"
                            />
                          )}
                          <Icon
                            className={cn(
                              "size-4 shrink-0 transition-colors",
                              isActive ? "text-gold-400" : "text-current",
                            )}
                            aria-hidden
                          />
                          <span className="truncate">{label}</span>
                          {count > 0 && (
                            <span className="ml-auto min-w-[1.125rem] rounded-full bg-clay px-1 py-px text-center text-[0.625rem] leading-tight font-semibold text-sand tabular-nums">
                              {count}
                              <span className="sr-only"> awaiting verification</span>
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/** Where a notification takes you. Falls back to the section when the event
 *  carries no specific record. */
function destinationFor(item: AppNotification) {
  const section = {
    payment: "/admin/payments",
    booking: "/admin/bookings",
    food: "/admin/food",
    request: "/admin/requests",
    feedback: "/admin/feedback",
    invoice: "/admin/invoices",
    note: "/admin/bookings",
  }[item.kind];

  if (!item.entityId) return section;
  // Payments and bookings both point at a booking; the others live on a board
  // where the section itself is the right landing place.
  if (item.kind === "payment") return "/admin/payments";
  if (item.kind === "booking" || item.kind === "note" || item.kind === "feedback") {
    return `/admin/bookings/${item.entityId}`;
  }
  return section;
}

function NotificationTray() {
  const notifications = useNotifications();
  const { markNotificationsRead } = useMockData();
  const unread = notifications.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);

  // What has already been on screen. Seeded on the first pass so signing in
  // does not fire off the whole backlog as if it had just happened.
  const seen = useRef<Set<string> | null>(null);
  const [flash, setFlash] = useState<AppNotification | null>(null);

  useEffect(() => {
    const fresh = firstUnannounced(notifications, seen.current);
    seen.current = new Set(notifications.map((n) => n.id));
    if (fresh) setFlash(fresh);
  }, [notifications]);

  // Its own effect, keyed on the notification rather than the list: a refetch
  // while the card is up would otherwise cancel the timer and strand it.
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [flash]);

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
            className="relative text-sand hover:bg-sand/12"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          >
            <Bell aria-hidden />
            {unread > 0 && (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 text-[0.625rem] leading-none font-semibold text-white tabular-nums ring-2 ring-ink"
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
                to={destinationFor(flash)}
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
          <ul className="mt-4 divide-y divide-stone/20">
            {notifications.map((item) => (
              <li key={item.id}>
                <Link
                  to={destinationFor(item)}
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
                  <ChevronRight
                    className="mt-1 size-4 shrink-0 text-stone"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AdminShell() {
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const leave = () => {
    signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-dvh bg-sand lg:grid lg:grid-cols-[13.5rem_1fr]">
      {/* Desktop sidebar. A hairline on the right edge only — a ring drew
          brass down the offscreen side and along the top of the window. */}
      <aside
        data-print-chrome
        className="sticky top-0 hidden h-dvh flex-col border-r border-gold/10 bg-sidebar px-2.5 py-4 lg:flex"
      >
        <div className="px-1.5 pb-1">
          <Logo variant="onDark" size="h-12" />
        </div>
        {/* `min-h-0` is what lets this actually shrink inside the flex column;
            without it the region grows and the whole page scrolls instead. */}
        <div className="scrollbar-slim mt-5 min-h-0 flex-1 overflow-y-auto pr-0.5">
          <NavItems />
        </div>
        <div className="space-y-2.5 px-1.5 pt-3">
          <hr className="rule-gold" />
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-clay text-[0.625rem] font-semibold text-sand">
              {initials(session?.name ?? "")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8125rem] leading-tight text-sand">
                {session?.name}
              </p>
              <p className="text-[0.6875rem] text-sand/40">
                {ROLE_LABEL[session?.role ?? "staff"]}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-sand/50 hover:bg-white/8 hover:text-sand"
              onClick={leave}
              aria-label="Sign out"
            >
              <LogOut aria-hidden />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Mobile / tablet top bar */}
        <header
          data-print-chrome
          className="sticky top-0 z-30 flex items-center gap-3 bg-sidebar px-4 py-3 lg:hidden"
        >
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-sand hover:bg-sand/12"
                aria-label="Open navigation"
              >
                <MenuIcon aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-sidebar text-sand">
              <SheetHeader>
                <SheetTitle className="text-sand">
                  <Logo variant="onDark" />
                </SheetTitle>
              </SheetHeader>
              <div className="scrollbar-slim overflow-y-auto px-3 pb-4">
                <NavItems onNavigate={() => setMobileOpen(false)} />
                <hr className="rule-gold my-3" />
                <Button
                  variant="ghost"
                  className="w-full justify-start text-[0.8125rem] text-sand/60 hover:bg-white/8 hover:text-sand"
                  onClick={leave}
                >
                  <LogOut aria-hidden />
                  Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <Logo variant="onDark" size="h-11" className="lg:hidden" />
          <div className="ml-auto">
            <NotificationTray />
          </div>
        </header>

        {/* Desktop top bar */}
        <div className="sticky top-0 z-20 hidden items-center gap-3 bg-sidebar px-8 py-2.5 lg:flex">
          <p className="text-sm text-sand/60">
            Homes of Sanctuary <span className="text-gold-400">·</span> Nandi Hills
          </p>
          <div className="ml-auto flex items-center gap-1">
            <NotificationTray />
          </div>
        </div>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
