import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import useAuthStore from '../hooks/useAuth';
import PageLoader from '../pages/PageLoader';

export default function ProtectedRoute() {
  const { user, profile, loading } = useAuthStore();

  if (loading) return <PageLoader />;
  if (!user)   return <Navigate to="/login" replace />;

  // Block disabled users from accessing the app.
  if (profile?.is_active === false || profile?.account_status === 'disabled') {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}