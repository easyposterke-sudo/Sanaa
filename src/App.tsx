import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { HomePage } from './HomePage';
import { LoginPage } from './auth/LoginPage';
import { SignupPage } from './auth/SignupPage';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { useAuthStore } from './auth/authStore';
import { AdminEntry } from './admin/AdminEntry';
import { AdminRoute } from './admin/AdminRoute';

const AppLayout = lazy(() =>
  import('./components/layout/AppLayout').then((m) => ({ default: m.AppLayout }))
);
const PosterLayout = lazy(() =>
  import('./poster/components/PosterLayout').then((m) => ({ default: m.PosterLayout }))
);
const TemplateManagementPage = lazy(() =>
  import('./poster/components/TemplateManagementPage').then((m) => ({
    default: m.TemplateManagementPage,
  }))
);
const MyStuffPage = lazy(() =>
  import('./poster/components/MyStuffPage').then((m) => ({ default: m.MyStuffPage }))
);
function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-950">
      <div className="text-zinc-500 dark:text-zinc-400">Loading…</div>
    </div>
  );
}

function App() {
  const { pathname } = useLocation();
  const init = useAuthStore((state) => state.init);

  useEffect(() => {
    if (pathname !== '/admin') void init();
  }, [init, pathname]);

  if (pathname === '/' || pathname === '') {
    return <HomePage />;
  }

  if (pathname === '/login') return <LoginPage />;
  if (pathname === '/signup') return <SignupPage />;
  if (pathname === '/admin') return <AdminEntry />;
  if (pathname === '/poster/templates') return <AdminRoute><Suspense fallback={<LoadingFallback />}><TemplateManagementPage /></Suspense></AdminRoute>;

  return (
    <ProtectedRoute><Suspense fallback={<LoadingFallback />}>
      {pathname === '/3d' ? (
        <AppLayout />
      ) : pathname === '/poster/my' ? (
        <MyStuffPage />
      ) : (
        <PosterLayout />
      )}
    </Suspense></ProtectedRoute>
  );
}

export default App;
