import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import LoginPage from "@/pages/auth/LoginPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import DesignSystemPage from "@/pages/DesignSystemPage";
import { AdminShell } from "@/components/layout/AdminShell";
import DashboardPage from "@/pages/admin/DashboardPage";
import BookingsListPage from "@/pages/admin/BookingsListPage";
import BookingDetailPage from "@/pages/admin/BookingDetailPage";
import NewBookingPage from "@/pages/admin/NewBookingPage";
import EditBookingPage from "@/pages/admin/EditBookingPage";
import PaymentQueuePage from "@/pages/admin/PaymentQueuePage";
import VillasListPage from "@/pages/admin/VillasListPage";
import VillaDetailPage from "@/pages/admin/VillaDetailPage";
import CustomersListPage from "@/pages/admin/CustomersListPage";
import CustomerDetailPage from "@/pages/admin/CustomerDetailPage";
import CalendarPage from "@/pages/admin/CalendarPage";
import KitchenPage from "@/pages/admin/KitchenPage";
import RequestsPage from "@/pages/admin/RequestsPage";
import FeedbackPage from "@/pages/admin/FeedbackPage";
import InvoicesPage from "@/pages/admin/InvoicesPage";
import SettingsPage from "@/pages/admin/SettingsPage";
import { GuestShell } from "@/components/layout/GuestShell";
import GuestDashboardPage from "@/pages/guest/GuestDashboardPage";
import GuestBookPage from "@/pages/guest/GuestBookPage";
import GuestBookingPage from "@/pages/guest/GuestBookingPage";
import GuestPaymentPage from "@/pages/guest/GuestPaymentPage";
import GuestInvoicePage from "@/pages/guest/GuestInvoicePage";
import GuestAmenitiesPage from "@/pages/guest/GuestAmenitiesPage";
import GuestFoodPage from "@/pages/guest/GuestFoodPage";
import GuestRequestsPage from "@/pages/guest/GuestRequestsPage";
import GuestFeedbackPage from "@/pages/guest/GuestFeedbackPage";
import StaffQueuePage from "@/pages/staff/StaffQueuePage";
import NotFoundPage from "@/pages/NotFoundPage";
import { useSession } from "@/services/session";
import type { Role } from "@/types";

/**
 * Role-aware routing over the mock session.
 *
 * Phase 2: `useSession()` reads from Supabase Auth instead of localStorage and
 * `RequireRole` checks a real claim. The route table itself does not change —
 * React Router stays exactly as it is, no framework migration.
 */
function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { session } = useSession();
  const location = useLocation();

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.role !== role) return <Navigate to={homeFor(session.role)} replace />;
  return <>{children}</>;
}

/** Where each role belongs. One definition, used by the guard and the root. */
function homeFor(role: Role) {
  return role === "admin" ? "/admin" : role === "staff" ? "/staff" : "/guest";
}

function RootRedirect() {
  const { session } = useSession();
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={homeFor(session.role)} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/design-system" element={<DesignSystemPage />} />
      {/* `/design` kept as an alias — it is the shorter name people type. */}
      <Route path="/design" element={<Navigate to="/design-system" replace />} />

      <Route
        path="/admin"
        element={
          <RequireRole role="admin">
            <AdminShell />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
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
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="settings" element={<SettingsPage />} />
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
        <Route path="book" element={<GuestBookPage />} />
        <Route path="booking" element={<GuestBookingPage />} />
        <Route path="payment" element={<GuestPaymentPage />} />
        <Route path="invoice" element={<GuestInvoicePage />} />
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
  );
}
