import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/layout/ProtectedRoute.js';
import { RoleRoute } from './components/layout/RoleRoute.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { useAuthStore } from './store/auth.store.js';

// Public pages
const LoginPage = lazy(() => import('./features/auth/LoginPage.js'));
const RegisterPage = lazy(() => import('./features/auth/RegisterPage.js'));
const SetupPage = lazy(() => import('./features/auth/SetupPage.js'));
const CallbackPage = lazy(() => import('./features/auth/CallbackPage.js'));
const AcceptInvitePage = lazy(() => import('./features/invites/AcceptInvitePage.js'));
const SubscriptionExpiredPage = lazy(
  () => import('./features/subscription/SubscriptionExpiredPage.js'),
);
const PublicBookingPage = lazy(() => import('./features/booking/PublicBookingPage.js'));

// Shared protected pages
const MeetingTypes = lazy(() => import('./features/meeting-types/MeetingTypesPage.js'));
const BookingPage = lazy(() => import('./features/booking/BookingPage.js'));

// Super Admin pages
const SuperAdminDashboard = lazy(
  () => import('./features/super-admin/SuperAdminDashboard.js'),
);
const OrganizationsPage = lazy(
  () => import('./features/super-admin/OrganizationsPage.js'),
);

// Org Admin pages
const OrgAdminDashboard = lazy(
  () => import('./features/org-admin/OrgAdminDashboard.js'),
);
const UsersPage = lazy(() => import('./features/org-admin/UsersPage.js'));
const FeatureFlagsPage = lazy(() => import('./features/org-admin/FeatureFlagsPage.js'));
const BookingsPage = lazy(() => import('./features/bookings/BookingsPage.js'));

// Maintainer pages
const MaintainerDashboard = lazy(
  () => import('./features/maintainer/MaintainerDashboard.js'),
);
const AvailabilityPage = lazy(
  () => import('./features/maintainer/AvailabilityPage.js'),
);

/** Redirect / to role-appropriate home page. */
function RootRedirect(): React.ReactElement {
  const principal = useAuthStore((s) => s.principal);
  if (!principal) return <Navigate to="/login" replace />;

  switch (principal.role) {
    case 'SUPER_ADMIN':
      return <Navigate to="/super-admin/dashboard" replace />;
    case 'ADMIN':
      return <Navigate to="/org/dashboard" replace />;
    default:
      return <Navigate to="/maintainer/dashboard" replace />;
  }
}

export function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex items-center justify-center h-screen text-slate-400">Loading…</div>}>
        <Routes>
          {/* ── Public routes ─────────────────────────────────── */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/auth/callback" element={<CallbackPage />} />
          <Route path="/subscription-required" element={<SubscriptionExpiredPage />} />
          <Route path="/invites/:token/accept" element={<AcceptInvitePage />} />
          <Route path="/:orgSlug/:username/:meetingSlug" element={<PublicBookingPage />} />

          {/* ── Protected + role-gated routes ─────────────────── */}
          <Route element={<ProtectedRoute />}>
            {/* Root redirect based on role */}
            <Route path="/" element={<RootRedirect />} />

            {/* Legacy /dashboard route — keep working for any existing links */}
            <Route path="/dashboard" element={<RootRedirect />} />

            {/* App shell wraps all role-gated pages */}
            <Route element={<AppLayout />}>

              {/* Super Admin */}
              <Route element={<RoleRoute allowedRoles={['SUPER_ADMIN']} />}>
                <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />
                <Route path="/super-admin/organizations" element={<OrganizationsPage />} />
              </Route>

              {/* Org Admin */}
              <Route element={<RoleRoute allowedRoles={['ADMIN']} />}>
                <Route path="/org/dashboard" element={<OrgAdminDashboard />} />
                <Route path="/org/users" element={<UsersPage />} />
                <Route path="/org/bookings" element={<BookingsPage />} />
                <Route path="/org/feature-flags" element={<FeatureFlagsPage />} />
              </Route>

              {/* Maintainer / Member */}
              <Route element={<RoleRoute allowedRoles={['MAINTAINER', 'MEMBER']} />}>
                <Route path="/maintainer/dashboard" element={<MaintainerDashboard />} />
                <Route path="/maintainer/availability" element={<AvailabilityPage />} />
                <Route path="/maintainer/bookings" element={<BookingsPage />} />
              </Route>

              {/* Shared — accessible by ADMIN, MAINTAINER, MEMBER */}
              <Route
                element={<RoleRoute allowedRoles={['ADMIN', 'MAINTAINER', 'MEMBER']} />}
              >
                <Route path="/meeting-types" element={<MeetingTypes />} />
              </Route>

            </Route>

            {/* Legacy single-booking detail (no sidebar needed) */}
            <Route path="/bookings/:id" element={<BookingPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
