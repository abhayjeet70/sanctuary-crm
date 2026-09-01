import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  CalendarPlus,
  CalendarCheck,
  ChefHat,
  ConciergeBell,
  Home,
  LogOut,
  MessageSquareQuote,
  Receipt,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DevBadge, Logo } from "@/components/common";
import { cn } from "@/lib/utils";
import { useSession } from "@/services/session";

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

export function GuestShell() {
  const { session, signOut } = useSession();
  const navigate = useNavigate();

  const leave = () => {
    signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-dvh bg-sand pb-20 lg:pb-0">
      {/* Slim chrome — the guest portal is photography-led, not app-led */}
      <header className="bg-ink">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <Logo variant="onDark" size="h-11 sm:h-12" />
          <div className="flex items-center gap-2">
            <DevBadge className="hidden bg-gold/15 text-gold-200 ring-1 ring-gold/30 sm:inline-flex" />
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
        </div>

        {/* Desktop nav rail */}
        <nav
          aria-label="Guest portal"
          className="mx-auto hidden max-w-5xl gap-1 px-8 pb-1 lg:flex"
        >
          {[...PRIMARY, ...SECONDARY].map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-t-lg px-3 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-sand text-ink"
                    : "text-sand/65 hover:bg-sand/10 hover:text-sand",
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
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
                    isActive ? "text-clay" : "text-stone-600 hover:text-ink",
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
