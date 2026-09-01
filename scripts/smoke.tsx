/* Renders every route to a string. A blank page in the browser is a render-time
 * throw, and this catches it without a browser. Run: npm run smoke */
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { AppRoutes } from "../src/routes/AppRoutes";
import { MockDataProvider } from "../src/services/mock/MockDataProvider";
import { MockSessionProvider } from "../src/services/mock/MockSessionProvider";

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
});

const ROUTES = [
  "/login",
  "/design-system",
  "/admin",
  "/admin/dashboard",
  "/admin/bookings",
  "/admin/bookings/new",
  "/admin/bookings/b-1001",
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
  "/nope",
];
let failed = 0;

for (const role of ["admin", "guest"] as const) {
  store.set("hos.mock-session", JSON.stringify({ role, name: "Smoke", customerId: "c-pooja" }));
  for (const route of ROUTES) {
    try {
      const html = renderToString(
        <MockSessionProvider>
          <MockDataProvider>
            <TooltipProvider>
              <MemoryRouter initialEntries={[route]}>
                <AppRoutes />
              </MemoryRouter>
            </TooltipProvider>
          </MockDataProvider>
        </MockSessionProvider>,
      );
      // A cross-role route renders a <Navigate> and therefore no markup —
      // that is the guard working, not a crash.
      const redirects =
        route === "/admin" ||
        (role === "admin" ? route === "/guest" : route.startsWith("/admin"));
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

console.log(failed ? `\n${failed} route(s) failed to render` : "\nall routes render");
process.exit(failed ? 1 : 0);
