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
  Wallet,
  Menu as MenuIcon,
  ChevronRight,
  X,
  Building2,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo } from "@/components/common";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { useMockData, useNotifications, usePaymentVerificationQueue } from "@/hooks/useData";
import { useSession } from "@/services/session";
import { firstUnannounced } from "@/services/domain";
import type { AppNotification } from "@/types";
import { initials } from "@/lib/format";

const NAV = [
  { to: "/admin/dashboard", label: "Dashboard", icon: Home },
  { to: "/admin/bookings", label: "Bookings", icon: BookOpen },
  { to: "/admin/payments", label: "Payments", icon: Wallet, badge: "payments" },
  { to: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/admin/villas", label: "Villas", icon: Building2 },
  { to: "/admin/customers", label: "Guests", icon: Users },
  { to: "/admin/food", label: "Kitchen", icon: ChefHat },
  { to: "/admin/requests", label: "Requests", icon: ClipboardList },
  { to: "/admin/feedback", label: "Feedback", icon: MessageSquareQuote },
  { to: "/admin/invoices", label: "Invoices", icon: Receipt },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;

function NavItems({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const queue = usePaymentVerificationQueue();

  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon, ...rest }) => {
        const count = "badge" in rest && rest.badge === "payments" ? queue.length : 0;
        const link = (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                collapsed && "justify-center px-2",
                isActive
                  ? "bg-sidebar-accent text-white shadow-[inset_2px_0_0_0_var(--color-gold)]"
                  : "text-sand/65 hover:bg-sidebar-accent/60 hover:text-white",
              )
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {!collapsed && <span className="truncate">{label}</span>}
            {count > 0 && (
              <span
                className={cn(
                  "ml-auto rounded-full bg-clay px-1.5 py-0.5 text-[0.6875rem] font-semibold text-sand",
                  collapsed && "absolute top-1 right-1 ml-0",
                )}
              >
                {count}
                <span className="sr-only"> awaiting verification</span>
              </span>
            )}
          </NavLink>
        );

        return collapsed ? (
          <Tooltip key={to}>
            <TooltipTrigger asChild>
              <span className="relative">{link}</span>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        ) : (
          link
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
    <div className="min-h-dvh bg-sand lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-sidebar px-3 py-5 ring-1 ring-gold/15 lg:flex">
        <div className="px-2">
          <Logo variant="onDark" />
        </div>
        <div className="mt-7 flex-1 overflow-y-auto">
          <NavItems />
        </div>
        <div className="space-y-3 px-2 pt-4">
          <hr className="rule-gold" />
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-clay text-xs font-semibold text-sand">
              {initials(session?.name ?? "")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-sand">{session?.name}</p>
              <p className="text-xs text-sand/50">Owner</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-sand/60 hover:bg-sand/12 hover:text-sand"
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
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-sidebar px-4 py-3 lg:hidden">
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
              <div className="px-3">
                <NavItems onNavigate={() => setMobileOpen(false)} />
                <Button
                  variant="ghost"
                  className="mt-4 w-full justify-start text-sand/70 hover:bg-sand/12 hover:text-sand"
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
