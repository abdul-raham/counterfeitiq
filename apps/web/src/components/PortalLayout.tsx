import { useState, type FormEvent } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { LogIn } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { NotConnected } from './portal';
import { StatusMessage } from './StatusMessage';
import { isSampleMode } from '../lib/api';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { isManufacturerRole, setSession, useSession } from '../lib/v2/session';

export interface NavItem {
  to: string;
  label: string;
}

type Audience = 'manufacturer' | 'admin';

/**
 * Decides only what this browser shows. It is not a security boundary:
 * the API must authorize every request, whatever this component does.
 */
export function ProtectedPortal({ audience, nav }: { audience: Audience; nav: NavItem[] }) {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  if (!session) return <Navigate to={`/${audience}/login`} replace state={{ from: location.pathname }} />;

  const allowed = audience === 'admin' ? session.role === 'PLATFORM_ADMIN' : isManufacturerRole(session.role);
  if (!allowed) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <StatusMessage tone="warn" title="You do not have access to this area" role="alert">
          This account cannot use the {audience} portal.
        </StatusMessage>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => {
            setSession(null);
            navigate(`/${audience}/login`);
          }}
        >
          Sign in with another account
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-10 lg:py-10">
      <aside className="no-print lg:w-52 lg:shrink-0">
        <p className="text-xs font-medium text-muted">{audience === 'admin' ? 'Admin' : 'Manufacturer'} portal</p>
        <p className="mt-0.5 truncate text-sm font-medium">{session.displayName}</p>
        <nav aria-label={`${audience} portal`} className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:px-0">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          className="mt-2 block rounded-md px-3 py-2 text-sm text-muted underline underline-offset-4 hover:text-ink"
          onClick={() => {
            setSession(null);
            navigate(`/${audience}/login`);
          }}
        >
          Sign out
        </button>
      </aside>
      <div className="min-w-0 flex-1"><Outlet /></div>
    </div>
  );
}

export function LoginPage({ audience }: { audience: Audience }) {
  const title = audience === 'admin' ? 'Admin sign in' : 'Manufacturer sign in';
  useDocumentTitle(title);
  const session = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (session) return <Navigate to={`/${audience}/dashboard`} replace />;

  function signInForSample(event: FormEvent) {
    event.preventDefault();
    setSession(audience === 'admin'
      ? { token: 'sample', role: 'PLATFORM_ADMIN', displayName: 'Sample administrator', manufacturerId: null }
      : { token: 'sample', role: 'MANUFACTURER_ADMIN', displayName: 'Example Pharma (sample)', manufacturerId: 'mfr-1' });
    navigate(`/${audience}/dashboard`);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6 sm:py-14">
      <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight">{title}</h1>
      {isSampleMode() ? (
        <form onSubmit={signInForSample} className="mt-6 space-y-4">
          <StatusMessage tone="warn" title="Sample mode">Any details work here. Nothing is checked, and nothing is real.</StatusMessage>
          <Input label="Email" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Input label="Password" type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} />
          <Button type="submit" className="w-full">
            <LogIn aria-hidden="true" className="size-5" />
            Sign in to sample portal
          </Button>
        </form>
      ) : (
        <div className="mt-6">
          <NotConnected
            endpoint="a sign-in method in the V2 contract"
            what="Sign-in is not available yet. The API expects a bearer token, but how accounts sign in has not been agreed."
          />
        </div>
      )}
      {audience === 'manufacturer' && (
        <p className="mt-6 text-sm text-muted">
          New to CounterfeitIQ? <Link to="/manufacturer/apply" className="rounded-sm text-ink underline underline-offset-4">Apply as a manufacturer</Link>.
        </p>
      )}
    </div>
  );
}
