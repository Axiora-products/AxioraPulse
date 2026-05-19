import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import useAuthStore from '../hooks/useAuth';
import PageLoader from '../pages/PageLoader';

export default function ProtectedRoute() {
  const { user, profile, loading } = useAuthStore();

  if (loading) return <PageLoader />;
  if (!user)   return <Navigate to="/login" replace />;

  // Block disabled users.
  if (profile?.is_active === false || profile?.account_status === 'disabled') {
    return <Navigate to="/login" replace />;
  }

  // App is in coming-soon mode — only internal team members get through.
  if (!profile?.is_internal) {
    return <Navigate to="/coming-soon" replace />;
  }

  return <Outlet />;
}