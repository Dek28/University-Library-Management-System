import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Menu, Bell, Search, LogOut, KeyRound, ChevronDown, User as UserIcon, Sun, Moon,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';
import { notificationApi, resourceApi } from '../api/endpoints';
import { Avatar } from '../components/ui';
import { fullName } from '../utils/format';
import useDebounce from '../hooks/useDebounce';

/** Closes a popover when the pointer goes down anywhere outside it. */
function useDismissOnOutside(ref, onDismiss) {
  useEffect(() => {
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onDismiss();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onDismiss]);
}

/** Global search: suggestions from the catalogue, keyboard navigable. */
function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(term, 250);
  const navigate = useNavigate();
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: ['suggest', debounced],
    queryFn: () => resourceApi.suggest(debounced),
    enabled: debounced.trim().length >= 2,
    staleTime: 30_000,
  });

  useDismissOnOutside(boxRef, () => setOpen(false));

  // "/" focuses search from anywhere, the way every tool with a search box does.
  useEffect(() => {
    const onKeyDown = (event) => {
      const typingElsewhere = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)
        || event.target.isContentEditable;
      if (event.key === '/' && !typingElsewhere) {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const go = (suggestion) => {
    setOpen(false);
    setTerm('');
    if (suggestion.type === 'title') navigate(`/catalog/${suggestion.id}`);
    else navigate(`/catalog?author=${suggestion.id}`);
  };

  const submit = (event) => {
    event.preventDefault();
    if (!term.trim()) return;
    setOpen(false);
    navigate(`/catalog?q=${encodeURIComponent(term.trim())}`);
  };

  return (
    <div ref={boxRef} className="relative hidden w-full max-w-sm md:block">
      <form onSubmit={submit} role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search the library"
          aria-label="Search the catalogue"
          className="h-9 w-full rounded-lg border border-transparent bg-slate-100 pl-9 pr-9 text-base text-slate-900
            transition placeholder:text-slate-500
            hover:bg-slate-200/60
            focus:border-brand-500 focus:bg-panel focus:outline-hidden focus:ring-4 focus:ring-brand-500/15"
        />
        {!term && (
          <span className="kbd pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" aria-hidden="true">/</span>
        )}
      </form>

      {open && debounced.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-11 z-20 overflow-hidden rounded-xl border border-line bg-panel shadow-pop animate-pop-in">
          {isFetching && suggestions.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">Searching…</p>
          )}
          {!isFetching && suggestions.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">No matches for “{debounced}”.</p>
          )}
          <ul>
            {suggestions.map((suggestion) => (
              <li key={`${suggestion.type}-${suggestion.id}`}>
                <button
                  type="button"
                  onClick={() => go(suggestion)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
                >
                  <span className="truncate text-base text-slate-800">{suggestion.label}</span>
                  <span className="shrink-0 text-2xs uppercase tracking-wide text-slate-400">{suggestion.type}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Light/dark switch. The icon shows the theme it will move to, not the current one. */
function ThemeToggle() {
  const resolved = useThemeStore((state) => state.resolved);
  const toggle = useThemeStore((state) => state.toggle);
  const goingDark = resolved === 'light';

  return (
    <button
      type="button"
      onClick={toggle}
      className="icon-btn text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      aria-label={goingDark ? 'Switch to dark theme' : 'Switch to light theme'}
      title={goingDark ? 'Dark theme' : 'Light theme'}
    >
      {goingDark ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
    </button>
  );
}

function AccountMenu() {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const ref = useRef(null);

  useDismissOnOutside(ref, () => setOpen(false));

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const item = 'flex w-full items-center gap-2.5 px-3 py-2 text-base text-slate-700 transition-colors hover:bg-slate-50';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-slate-100"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar user={user} size="sm" />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium text-slate-800">{user?.firstName} {user?.lastName}</span>
          <span className="block text-2xs text-slate-500">{user?.role?.name}</span>
        </span>
        <ChevronDown className={clsx('h-3.5 w-3.5 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-12 z-20 w-64 overflow-hidden rounded-xl border border-line bg-panel p-1.5 shadow-pop animate-pop-in">
          <div className="mb-1 flex items-center gap-3 rounded-lg px-2.5 py-2">
            <Avatar user={user} size="md" />
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold text-slate-900">{fullName(user)}</span>
              <span className="block truncate text-xs text-slate-500">{user?.email}</span>
            </span>
          </div>

          <div className="h-px bg-line" />

          <div className="py-1">
            <Link to="/profile" onClick={() => setOpen(false)} role="menuitem" className={clsx(item, 'rounded-lg')}>
              <UserIcon className="h-4 w-4 text-slate-400" aria-hidden="true" /> My profile
            </Link>
            <Link to="/profile?tab=security" onClick={() => setOpen(false)} role="menuitem" className={clsx(item, 'rounded-lg')}>
              <KeyRound className="h-4 w-4 text-slate-400" aria-hidden="true" /> Change password
            </Link>
          </div>

          <div className="h-px bg-line" />

          <div className="pt-1">
            <button type="button" onClick={signOut} role="menuitem"
              className={clsx(item, 'rounded-lg text-red-600 hover:bg-red-50')}>
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Topbar({ onMenuClick }) {
  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationApi.unreadCount,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const count = unread?.count || 0;

  return (
    <header className="sticky top-0 z-20 flex h-15 items-center gap-3 border-b border-line bg-panel/85 px-4 backdrop-blur-md lg:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="icon-btn text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* No page title here: each page's own heading and breadcrumb already say where you are. */}
      <div className="flex flex-1 justify-center px-2">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-0.5">
        <ThemeToggle />

        <Link
          to="/notifications"
          className="icon-btn relative text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        >
          <Bell className="h-[18px] w-[18px]" />
          {count > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-semibold text-on-solid ring-2 ring-panel">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Link>

        <div className="mx-1.5 h-5 w-px bg-line" aria-hidden="true" />

        <AccountMenu />
      </div>
    </header>
  );
}
