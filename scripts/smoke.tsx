/* Renders every route to a string. A blank page in the browser is a render-time
 * throw, and this catches it without a browser and without a network call.
 *
 * The session and data contexts are filled directly from the fixtures, so this
 * exercises the real page components while staying entirely offline — the
 * Supabase client is never imported. Run: npm run smoke */
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "../src/components/ui/tabs";
import { AppRoutes } from "../src/routes/AppRoutes";
import { MockDataProvider } from "../src/services/mock/MockDataProvider";
import { SessionContext } from "../src/services/session";
import type { MockSession } from "../src/types";

Object.assign(globalThis, {
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
});

const ROUTES = [
  "/login",
  "/reset-password",
  "/design-system",
  "/admin",
  "/admin/dashboard",
  "/admin/frontdesk",
  "/admin/bookings",
  "/admin/bookings/new",
  "/admin/bookings/b-1001",
  "/admin/bookings/b-1001/edit",
  "/admin/bookings/b-1010/edit",
  "/admin/bookings/b-1005",
  "/admin/bookings/nonexistent",
  "/admin/payments",
  "/admin/villas",
  "/admin/villas/v-praana",
  "/admin/villas/v-maaya",
  "/admin/customers",
  "/admin/customers/c-pooja",
  "/admin/calendar",
  "/admin/food",
  "/admin/requests",
  "/admin/feedback",
  "/admin/invoices",
  "/admin/reports",
  "/admin/employees",
  "/admin/settings",
  "/guest",
  "/guest/dashboard",
  "/guest/book",
  "/guest/booking",
  "/guest/payment",
  "/guest/invoice",
  "/guest/amenities",
  "/guest/food",
  "/guest/requests",
  "/guest/feedback",
  "/staff",
  "/nope",
];

let failed = 0;

for (const role of ["admin", "staff", "guest"] as const) {
  const session: MockSession =
    role === "admin"
      ? { role, name: "Anjali Rao" }
      : role === "staff"
        ? { role, name: "Lakshmi (Housekeeping)", team: "housekeeping" }
        : { role, name: "Pooja Bothra", customerId: "c-pooja" };

  const sessionValue = {
    session,
    loading: false,
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null, needsConfirmation: true }),
    signOut: async () => {},
    resetPassword: async () => ({ error: null }),
    updatePassword: async () => ({ error: null }),
  };

  for (const route of ROUTES) {
    try {
      const html = renderToString(
        <SessionContext.Provider value={sessionValue}>
          <MockDataProvider>
            <TooltipProvider>
              <MemoryRouter initialEntries={[route]}>
                <AppRoutes />
              </MemoryRouter>
            </TooltipProvider>
          </MockDataProvider>
        </SessionContext.Provider>,
      );

      // A cross-role route renders a <Navigate> and therefore no markup —
      // that is the guard working, not a crash.
      // A route belonging to another role renders a <Navigate> and no markup.
      const owner = route.startsWith("/admin")
        ? "admin"
        : route.startsWith("/staff")
          ? "staff"
          : route.startsWith("/guest")
            ? "guest"
            : null;
      const redirects =
        route === "/admin" || route === "/guest" || (owner !== null && owner !== role);

      if (redirects) {
        console.log(`  ok   ${role.padEnd(5)} ${route}  (redirected by RequireRole)`);
      } else if (html.length < 200) {
        throw new Error(`rendered almost nothing (${html.length} bytes)`);
      } else {
        console.log(`  ok   ${role.padEnd(5)} ${route}  (${html.length} bytes)`);
      }
    } catch (error) {
      failed++;
      console.error(`  FAIL ${role.padEnd(5)} ${route}\n       ${(error as Error).message}`);
    }
  }
}

/* A guarded route must WAIT while the session is loading, not redirect.
 * A sign-in link arrives as /guest/dashboard#access_token=...; redirecting
 * during that first async moment discards the URL and the sign-in with it. */
{
  const pending = renderToString(
    <SessionContext.Provider
      value={{
        session: null,
        loading: true,
        signIn: async () => ({ error: null }),
        signUp: async () => ({ error: null, needsConfirmation: true }),
        signOut: async () => {},
        resetPassword: async () => ({ error: null }),
        updatePassword: async () => ({ error: null }),
      }}
    >
      <MockDataProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/guest/dashboard"]}>
            <AppRoutes />
          </MemoryRouter>
        </TooltipProvider>
      </MockDataProvider>
    </SessionContext.Provider>,
  );

  if (pending.includes("Signing you in")) {
    console.log("  ok   guard waits while the session is loading");
  } else {
    failed++;
    console.error("  FAIL guard redirected while the session was still loading");
  }
}

/* Combined financial figures are the owner's. A manager works the same
 * screens all day and should not be shown the business's position on them.
 * Rendered both ways, because a check that only proves absence would still
 * pass if the figure had been deleted for everyone. */
{
  const render = (role: "admin" | "manager", route: string) =>
    renderToString(
      <SessionContext.Provider
        value={{
          session: { role, name: role === "admin" ? "Anjali Rao" : "Anand (Manager)" },
          loading: false,
          signIn: async () => ({ error: null }),
          signUp: async () => ({ error: null, needsConfirmation: true }),
          signOut: async () => {},
          resetPassword: async () => ({ error: null }),
          updatePassword: async () => ({ error: null }),
        }}
      >
        <MockDataProvider>
          <TooltipProvider>
            <MemoryRouter initialEntries={[route]}>
              <AppRoutes />
            </MemoryRouter>
          </TooltipProvider>
        </MockDataProvider>
      </SessionContext.Provider>,
    );

  const cases: [string, string][] = [
    // Employee management and the payment decision are the owner's alone.
    ["/admin/employees", "Add employee"],
    ["/admin/reports", "Collected"],
    ["/admin/payments", "Approve"],
    ["/admin/invoices", "Total billed"],
    ["/admin/invoices", "Still outstanding"],
    ["/admin/customers", "Lifetime spend"],
    ["/admin/dashboard", "Outstanding balance"],
    ["/admin/customers/c-pooja", "Lifetime spend"],
  ];

  for (const [route, figure] of cases) {
    const owner = render("admin", route);
    const manager = render("manager", route);
    if (!owner.includes(figure)) {
      failed++;
      console.error(`  FAIL owner cannot see "${figure}" on ${route}`);
    } else if (manager.includes(figure)) {
      failed++;
      console.error(`  FAIL manager is shown "${figure}" on ${route}`);
    } else {
      console.log(`  ok   "${figure}" is the owner's alone on ${route}`);
    }
  }
}

/* Tab styling is written against an attribute Radix has to actually set.
 * `data-active:` compiles to [data-active] and matches nothing — the same
 * mistake as `data-horizontal:` in this file, twice over. */
{
  const html = renderToString(
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
      </TabsList>
    </Tabs>,
  );

  const active = html.slice(html.indexOf("<button"), html.indexOf("One</button>"));
  const usesRealAttribute = /data-state="active"/.test(active);
  const stylesTargetIt = /data-\[state=active\]:/.test(active);
  const stalePattern = /(?:^|\s|:)data-active:/.test(html);

  if (usesRealAttribute && stylesTargetIt && !stalePattern) {
    console.log("  ok   the active tab's styles match the attribute Radix sets");
  } else {
    failed++;
    console.error(
      `  FAIL active tab styling: renders data-state=${usesRealAttribute}, ` +
        `styled for it=${stylesTargetIt}, stale data-active:=${stalePattern}`,
    );
  }
}

console.log(failed ? `\n${failed} route(s) failed to render` : "\nall routes render");
/* The sidebar describes whoever is signed in. It used to say "Owner" to
 * everybody — including a manager, which is simply untrue, and the one line on
 * screen a person would take at face value about their own access. */
{
  const sidebar = (role: "admin" | "manager") =>
    renderToString(
      <SessionContext.Provider
        value={{
          session: { role, name: role === "admin" ? "Anjali Rao" : "Vikram Nair" },
          loading: false,
          signIn: async () => ({ error: null }),
          signOut: () => {},
        } as never}
      >
        <TooltipProvider>
          <MockDataProvider>
            <MemoryRouter initialEntries={["/admin/dashboard"]}>
              <AppRoutes />
            </MemoryRouter>
          </MockDataProvider>
        </TooltipProvider>
      </SessionContext.Provider>,
    );

  const owner = sidebar("admin");
  const manager = sidebar("manager");

  const checks: [string, boolean][] = [
    ["the owner is called Owner", owner.includes(">Owner<")],
    ["a manager is not called Owner", !manager.includes(">Owner<")],
    ["a manager is called Manager", manager.includes(">Manager<")],
    ["the nav is grouped", ["Today", "Property", "Business"].every((g) => owner.includes(">" + g + "<"))],
    ["the active item carries its brass rail", /bg-gold[^"]*"/.test(owner) && owner.includes("-translate-y-1/2")],
    ["the scroll region is not the platform default", owner.includes("scrollbar-slim")],
  ];

  for (const [what, passed] of checks) {
    if (passed) {
      console.log("  ok   " + what);
    } else {
      failed++;
      console.error("  FAIL " + what);
    }
  }
}

/* An arranged arrival time has to reach every screen that quotes one.
 * Booking b-1001 arrives at 22:30; Villa Maaya opens at 14:00. Five screens
 * quoted the villa's standard instead of the guest's own time — including the
 * message we send the guest — so this is guarded rather than remembered. */
{
  const asGuest = (route: string) =>
    renderToString(
      <SessionContext.Provider
        value={{
          session: { role: "guest", name: "Pooja Bothra", customerId: "c-pooja" },
          loading: false,
          signIn: async () => ({ error: null }),
          signOut: () => {},
        } as never}
      >
        <TooltipProvider>
          <MockDataProvider>
            <MemoryRouter initialEntries={[route]}>
              <AppRoutes />
            </MemoryRouter>
          </MockDataProvider>
        </TooltipProvider>
      </SessionContext.Provider>,
    );

  for (const route of ["/guest/booking", "/guest/dashboard", "/guest/amenities"]) {
    const html = asGuest(route);
    const showsAgreed = html.includes("22:30");
    // Only the arrival was arranged on b-1001, so 11:00 for the departure is
    // correct and must not be flagged. 14:00 is the villa's standard arrival —
    // that is the one that would mean the agreed time had been ignored.
    const showsStandard = /from 14:00/.test(html);
    if (showsAgreed && !showsStandard) {
      console.log("  ok   " + route + " quotes the time the guest agreed");
    } else {
      failed++;
      console.error(
        "  FAIL " + route + " agreed=" + showsAgreed + " standard=" + showsStandard,
      );
    }
  }
}

const exitCode = failed ? 1 : 0;
process.exit(exitCode);
