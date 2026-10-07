import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import LoginPage from "@/pages/auth/LoginPage";
import { useSession } from "@/services/session";
import { PageLoading } from "@/components/common";
import type { Role } from "@/types";

// Every page but sign-in loads on demand, so the first visit downloads one screen, not the whole app.
const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPasswordPage"));
const BookStayPage = lazy(() => import("@/pages/auth/BookStayPage"));
const DesignSystemPage = lazy(() => import("@/pages/DesignSystemPage"));
const AdminShell = lazy(() => import("@/components/layout/AdminShell").then((m) => ({ default: m.AdminShell })));
const DashboardPage = lazy(() => import("@/pages/admin/DashboardPage"));
const FrontDeskPage = lazy(() => import("@/pages/admin/FrontDeskPage"));
const BookingsListPage = lazy(() => import("@/pages/admin/BookingsListPage"));
const BookingDetailPage = lazy(() => import("@/pages/admin/BookingDetailPage"));
const NewBookingPage = lazy(() => import("@/pages/admin/NewBookingPage"));
const EditBookingPage = lazy(() => import("@/pages/admin/EditBookingPage"));
const PaymentQueuePage = lazy(() => import("@/pages/admin/PaymentQueuePage"));
const VillasListPage = lazy(() => import("@/pages/admin/VillasListPage"));
const VillaDetailPage = lazy(() => import("@/pages/admin/VillaDetailPage"));
const CustomersListPage = lazy(() => import("@/pages/admin/CustomersListPage"));
const CustomerDetailPage = lazy(() => import("@/pages/admin/CustomerDetailPage"));
const CalendarPage = lazy(() => import("@/pages/admin/CalendarPage"));
const KitchenPage = lazy(() => import("@/pages/admin/KitchenPage"));
const RequestsPage = lazy(() => import("@/pages/admin/RequestsPage"));
const FeedbackPage = lazy(() => import("@/pages/admin/FeedbackPage"));
const InvoicesPage = lazy(() => import("@/pages/admin/InvoicesPage"));
const SettingsPage = lazy(() => import("@/pages/admin/SettingsPage"));
const EmployeesPage = lazy(() => import("@/pages/admin/EmployeesPage"));
const ReportsPage = lazy(() => import("@/pages/admin/ReportsPage"));
const HousekeepingPage = lazy(() => import("@/pages/admin/HousekeepingPage"));
const MaintenancePage = lazy(() => import("@/pages/admin/MaintenancePage"));
const AmenitiesPage = lazy(() => import("@/pages/admin/AmenitiesPage"));
const EnquiriesPage = lazy(() => import("@/pages/admin/EnquiriesPage"));
const MediaPage = lazy(() => import("@/pages/admin/MediaPage"));
const QuotesPage = lazy(() => import("@/pages/admin/QuotesPage"));
const FollowUpsPage = lazy(() => import("@/pages/admin/FollowUpsPage"));
const ActivityLogPage = lazy(() => import("@/pages/admin/ActivityLogPage"));
const RolesPage = lazy(() => import("@/pages/admin/RolesPage"));
const ExpensesPage = lazy(() => import("@/pages/admin/ExpensesPage"));
const WaitlistPage = lazy(() => import("@/pages/admin/WaitlistPage"));
const LostFoundPage = lazy(() => import("@/pages/admin/LostFoundPage"));
const GuestShell = lazy(() => import("@/components/layout/GuestShell").then((m) => ({ default: m.GuestShell })));
const GuestDashboardPage = lazy(() => import("@/pages/guest/GuestDashboardPage"));
const GuestBookPage = lazy(() => import("@/pages/guest/GuestBookPage"));
const CancellationsPage = lazy(() => import("@/pages/admin/CancellationsPage"));
const CaptiveWifiPage = lazy(() => import("@/pages/admin/CaptiveWifiPage"));
const WifiPortalPage = lazy(() => import("@/pages/wifi/WifiPortalPage"));
const GuestWaitlistPage = lazy(() => import("@/pages/guest/GuestWaitlistPage"));
const GuestVoucherPage = lazy(() => import("@/pages/guest/GuestVoucherPage"));
const GuestPeoplePage = lazy(() => import("@/pages/guest/GuestPeoplePage"));
const GuestLostFoundPage = lazy(() => import("@/pages/guest/GuestLostFoundPage"));
const GuestBookingPage = lazy(() => import("@/pages/guest/GuestBookingPage"));
const GuestPaymentPage = lazy(() => import("@/pages/guest/GuestPaymentPage"));
const GuestInvoicePage = lazy(() => import("@/pages/guest/GuestInvoicePage"));
const GuestAmenitiesPage = lazy(() => import("@/pages/guest/GuestAmenitiesPage"));
const GuestFoodPage = lazy(() => import("@/pages/guest/GuestFoodPage"));
const GuestRequestsPage = lazy(() => import("@/pages/guest/GuestRequestsPage"));
const GuestFeedbackPage = lazy(() => import("@/pages/guest/GuestFeedbackPage"));
const StaffQueuePage = lazy(() => import("@/pages/staff/StaffQueuePage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));


/**
 * Role-aware routing over the mock session.
 *
 * Phase 2: `useSession()` reads from Supabase Auth instead of localStorage and
 * `RequireRole` checks a real claim. The route table itself does not change —
 * React Router stays exactly as it is, no framework migration.
 */
function RequireRole({ role, children }: { role: Role | Role[]; children: ReactNode }) {
  const { session, loading } = useSession();
  const location = useLocation();

  // Wait for the session before deciding. A magic link arrives as
  // /guest/dashboard#access_token=…, and redirecting during that first
  // async moment threw the URL — and the sign-in with it — away.
  if (loading) return <AuthPending />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(session.role)) return <Navigate to={homeFor(session.role)} replace />;
  return <>{children}</>;
}

/**
 * Owner-only pages inside the operations shell.
 *
 * A manager reaching one by typing the URL goes to the dashboard rather than
 * an error: they are signed in and allowed here, just not on this page.
 */
function RequireOwner({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  if (loading) return <AuthPending />;
  if (session?.role !== "admin") return <Navigate to="/admin/dashboard" replace />;
  return <>{children}</>;
}

/**
 * The booking holder's pages: money, the booking itself, and who else is on it.
 *
 * A companion is sent to their stay instead. RLS already returns nothing
 * behind these to them — this is so they land somewhere useful rather than on
 * an empty page that reads as a fault.
 */
function RequireHolder({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  if (loading) return <AuthPending />;
  if (session?.companionId) return <Navigate to="/guest/dashboard" replace />;
  return <>{children}</>;
}

/** Shown only for the moment it takes to read the stored session, or to
 *  exchange the token in a sign-in link. */
function AuthPending() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-sand">
      <p className="text-sm text-stone-600" role="status" aria-live="polite">
        Signing you in…
      </p>
    </div>
  );
}

/** Where each role belongs. One definition, used by the guard and the root. */
function homeFor(role: Role) {
  // A manager works the same operations shell as the owner; what differs is
  // what RLS lets them write, not which pages exist.
  if (role === "admin" || role === "manager") return "/admin";
  return role === "staff" ? "/staff" : "/guest";
}

function RootRedirect() {
  const { session, loading } = useSession();
  if (loading) return <AuthPending />;
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={homeFor(session.role)} replace />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/book" element={<BookStayPage />} />
      <Route path="/design-system" element={<DesignSystemPage />} />
      {/* Where a network controller sends a guest who joins the Wi-Fi. Public:
          it signs them in itself, with the same guest account as the portal. */}
      <Route path="/wifi" element={<WifiPortalPage />} />
      {/* `/design` kept as an alias — it is the shorter name people type. */}
      <Route path="/design" element={<Navigate to="/design-system" replace />} />

      <Route
        path="/admin"
        element={
          <RequireRole role={["admin", "manager"]}>
            <AdminShell />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="frontdesk" element={<FrontDeskPage />} />
        <Route path="bookings" element={<BookingsListPage />} />
        <Route path="bookings/new" element={<NewBookingPage />} />
        <Route path="bookings/:id" element={<BookingDetailPage />} />
        <Route path="bookings/:id/edit" element={<EditBookingPage />} />
        <Route path="payments" element={<PaymentQueuePage />} />
        <Route path="villas" element={<VillasListPage />} />
        <Route path="villas/:id" element={<VillaDetailPage />} />
        <Route path="customers" element={<CustomersListPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="food" element={<KitchenPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="housekeeping" element={<HousekeepingPage />} />
        <Route path="lost-found" element={<LostFoundPage />} />
        <Route path="maintenance" element={<MaintenancePage />} />
        <Route path="amenities" element={<AmenitiesPage />} />
        <Route path="media" element={<MediaPage />} />
        <Route path="wifi" element={<CaptiveWifiPage />} />
        <Route path="enquiries" element={<EnquiriesPage />} />
        <Route path="waitlist" element={<WaitlistPage />} />
        <Route path="quotes" element={<QuotesPage />} />
        <Route path="followups" element={<FollowUpsPage />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="cancellations" element={<CancellationsPage />} />
        <Route
          path="reports"
          element={
            <RequireOwner>
              <ReportsPage />
            </RequireOwner>
          }
        />
        <Route
          path="employees"
          element={
            <RequireOwner>
              <EmployeesPage />
            </RequireOwner>
          }
        />
        <Route
          path="expenses"
          element={
            <RequireOwner>
              <ExpensesPage />
            </RequireOwner>
          }
        />
        <Route
          path="roles"
          element={
            <RequireOwner>
              <RolesPage />
            </RequireOwner>
          }
        />
        <Route
          path="activity"
          element={
            <RequireOwner>
              <ActivityLogPage />
            </RequireOwner>
          }
        />
        <Route
          path="settings"
          element={
            <RequireOwner>
              <SettingsPage />
            </RequireOwner>
          }
        />
      </Route>
      <Route
        path="/guest"
        element={
          <RequireRole role="guest">
            <GuestShell />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="/guest/dashboard" replace />} />
        <Route path="dashboard" element={<GuestDashboardPage />} />
        <Route path="book" element={<RequireHolder><GuestBookPage /></RequireHolder>} />
        <Route path="waitlist" element={<RequireHolder><GuestWaitlistPage /></RequireHolder>} />
        <Route path="booking" element={<RequireHolder><GuestBookingPage /></RequireHolder>} />
        <Route path="payment" element={<RequireHolder><GuestPaymentPage /></RequireHolder>} />
        <Route path="voucher" element={<RequireHolder><GuestVoucherPage /></RequireHolder>} />
        <Route path="people" element={<RequireHolder><GuestPeoplePage /></RequireHolder>} />
        <Route path="lost-found" element={<GuestLostFoundPage />} />
        <Route path="invoice" element={<RequireHolder><GuestInvoicePage /></RequireHolder>} />
        <Route path="amenities" element={<GuestAmenitiesPage />} />
        <Route path="food" element={<GuestFoodPage />} />
        <Route path="requests" element={<GuestRequestsPage />} />
        <Route path="feedback" element={<GuestFeedbackPage />} />
      </Route>

      <Route
        path="/staff"
        element={
          <RequireRole role="staff">
            <StaffQueuePage />
          </RequireRole>
        }
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  );
}
