import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store.js';
import type { MemberRole } from '@dhp/types';

interface RoleRouteProps {
  allowedRoles: MemberRole[];
}

export function RoleRoute({ allowedRoles }: RoleRouteProps): React.ReactElement {
  const principal = useAuthStore((s) => s.principal);

  if (!principal) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(principal.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
