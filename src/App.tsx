import { lazy, Suspense } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const AppLayout = lazy(() =>
  import('./components/layout/AppLayout').then((m) => ({ default: m.AppLayout }))
);
const PosterLayout = lazy(() =>
  import('./poster/components/PosterLayout').then((m) => ({ default: m.PosterLayout }))
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

  if (pathname === '/' || pathname === '') {
    return <Navigate to="/poster" replace />;
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      {pathname === '/3d' ? <AppLayout /> : <PosterLayout />}
    </Suspense>
  );
}

export default App;
