import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../auth/authStore';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, initState } = useAuthStore();

  if (initState === 'loading' || initState === 'idle') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400">Loading…</div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
