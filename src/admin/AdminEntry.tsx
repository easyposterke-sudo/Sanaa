import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../auth/authStore';

export function AdminEntry() {
  const loginWithAccess = useAuthStore((state) => state.loginWithAccess);
  const user = useAuthStore((state) => state.user);
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loginWithAccess().then((result) => setError(result.error ?? null));
  }, [loginWithAccess]);

  if (error) return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="max-w-md rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold">Admin access unavailable</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{error}</p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Open /admin through your Cloudflare Access protected domain and complete the email code sign-in.</p>
        <a href="/" className="mt-5 inline-block text-sm font-medium text-violet-700">Back to home</a>
      </div>
    </main>
  );

  if (user?.role !== 'admin') return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-500 dark:bg-zinc-950">Checking admin access…</div>
  );

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">Admin workspace</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Signed in as {user.email}. Open an editor to create templates, upload fonts, or record a process.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Link to="/poster" className="rounded-xl border border-zinc-200 bg-white p-5 font-medium text-violet-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">Poster editor</Link>
          <Link to="/poster/templates" className="rounded-xl border border-zinc-200 bg-white p-5 font-medium text-violet-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">Manage templates</Link>
          <Link to="/3d" className="rounded-xl border border-zinc-200 bg-white p-5 font-medium text-violet-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">3D editor</Link>
        </div>
      </div>
    </main>
  );
}
