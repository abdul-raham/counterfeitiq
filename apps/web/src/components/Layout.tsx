import { lazy, Suspense, useEffect, useRef } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router';
import { MotionConfig } from 'motion/react';
import { ScanLine } from 'lucide-react';
import { isSampleMode } from '../lib/api';
import { ErrorBoundary } from './ErrorBoundary';

const SampleBanner = lazy(() => import('../features/sample/SampleBanner'));

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`;

export function Layout() {
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);

  // Move keyboard and screen-reader users to the new page's heading on navigation.
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('main h1')?.focus();
  }, [pathname]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only rounded-md bg-ink px-4 py-2 text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-10"
        >
          Skip to content
        </a>
        {isSampleMode() && <Suspense fallback={null}><SampleBanner /></Suspense>}
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
            <Link to="/" className="flex items-center gap-2 rounded-md font-semibold tracking-tight">
              <ScanLine aria-hidden="true" className="size-5" strokeWidth={2} />
              CounterfeitIQ
            </Link>
            <nav aria-label="Main" className="flex items-center">
              <NavLink to="/scan" className={navClass}>Scan</NavLink>
              <NavLink to="/lookup" className={navClass}>Look up</NavLink>
            </nav>
          </div>
        </header>
        <main id="main" className="flex-1">
          <ErrorBoundary key={pathname}><Outlet /></ErrorBoundary>
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-6 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
            <p>CounterfeitIQ gives evidence, not a guarantee. It is not affiliated with or endorsed by NAFDAC.</p>
            <a
              href="https://github.com/abdul-raham/counterfeitiq"
              className="rounded-sm underline underline-offset-4 hover:text-ink"
            >
              Open source, MIT licensed
            </a>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
