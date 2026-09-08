/* Renders every route to a string. A blank page in the browser is a render-time
 * throw, and this catches it without a browser and without a network call.
 *
 * The session and data contexts are filled directly from the fixtures, so this
 * exercises the real page components while staying entirely offline — the
 * Supabase client is never imported. Run: npm run smoke */
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "../src/components/ui/tooltip";
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

console.log(failed ? `\n${failed} route(s) failed to render` : "\nall routes render");
process.exit(failed ? 1 : 0);
