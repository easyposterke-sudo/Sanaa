/* eslint-disable react-refresh/only-export-components */
import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';

const ROUTER_STATE_KEY = '__easyposterRouterState';
const ROUTER_REVISION_KEY = '__easyposterRouterRevision';
let navigationSequence = 0;

export interface RouterLocation {
  pathname: string;
  state?: unknown;
}

export interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}

export type NavigateFunction = (
  destination: string | number,
  options?: NavigateOptions,
) => void;

function readPathname() {
  const value = window.location.hash.replace(/^#/, '').split('?')[0];
  if (!value) return '/';
  return value.startsWith('/') ? value : `/${value}`;
}

function readSnapshot() {
  return `${readPathname()}|${window.history.state?.[ROUTER_REVISION_KEY] ?? ''}`;
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
  };
}

export function useLocation(): RouterLocation {
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () => '/|');
  return {
    pathname: snapshot.split('|', 1)[0],
    state: window.history.state?.[ROUTER_STATE_KEY],
  };
}

export function useNavigate(): NavigateFunction {
  return useCallback((destination, options = {}) => {
    if (typeof destination === 'number') {
      window.history.go(destination);
      return;
    }

    const nextPath = destination.startsWith('/') ? destination : `/${destination}`;
    const nextState = {
      ...(window.history.state ?? {}),
      [ROUTER_STATE_KEY]: options.state,
      [ROUTER_REVISION_KEY]: `${Date.now()}-${navigationSequence++}`,
    };
    const nextUrl = `${window.location.pathname}${window.location.search}#${nextPath}`;

    if (options.replace) {
      window.history.replaceState(nextState, '', nextUrl);
    } else {
      window.history.pushState(nextState, '', nextUrl);
    }
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, []);
}

interface NavigateProps extends NavigateOptions {
  to: string;
}

export function Navigate({ to, replace, state }: NavigateProps) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(to, { replace, state });
  }, [navigate, replace, state, to]);

  return null;
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  children?: ReactNode;
}

export function Link({ to, onClick, target, children, ...props }: LinkProps) {
  const navigate = useNavigate();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      target === '_blank'
    ) {
      return;
    }

    event.preventDefault();
    navigate(to);
  };

  return (
    <a {...props} href={`#${to}`} target={target} onClick={handleClick}>
      {children}
    </a>
  );
}
