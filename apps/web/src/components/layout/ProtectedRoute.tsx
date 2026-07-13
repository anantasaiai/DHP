import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store.js';

/**
 * Route guard — UX only (§7A.1 frontend note).
 * Real enforcement is server-side at the Core API.
 * Public booking routes are deliberately outside this guard.
 */
export function ProtectedRoute(): React.ReactElement {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}
