
import { useEffect, useState } from 'react';
import {
  Outlet,
  useLocation,
  useMatches,
} from 'react-router';

import Sidebar from './Sidebar';
import Topbar from './Topbar';

/**
 * Derives the browser-tab title from the matched route's handle.
 */
function useRouteTitle() {
  const matches = useMatches();

  const withTitle = [...matches]
    .reverse()
    .find((match) => match.handle?.title);

  return withTitle?.handle?.title || 'Dashboard';
}

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const location = useLocation();
  const title = useRouteTitle();

  /**
   * Close sidebar on mobile and return to the
   * top whenever the route changes.
   */
  useEffect(() => {
    setSidebarOpen(false);

    window.scrollTo({
      top: 0,
      left: 0,
    });
  }, [location.pathname]);

  /**
   * Update browser tab title.
   */
  useEffect(() => {
    document.title = `${title} · ULMS`;
  }, [title]);

  return (
    <div className="min-h-screen bg-slate-100">

      {/* Skip navigation for accessibility */}
      <a
        href="#main-content"
        className="
          sr-only
          focus:not-sr-only
          focus:fixed
          focus:left-4
          focus:top-4
          focus:z-100
          focus:rounded-lg
          focus:bg-blue-700
          focus:px-4
          focus:py-2.5
          focus:text-sm
          focus:font-semibold
          focus:text-white
          focus:shadow-lg
          focus:outline-hidden
          focus:ring-2
          focus:ring-blue-300
        "
      >
        Skip to main content
      </a>

      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Application content */}
      <div className="min-h-screen lg:pl-[252px]">

        {/* Top navigation */}
        <Topbar onMenuClick={() => setSidebarOpen(true)} />

        {/* Main page content */}
        <main
          id="main-content"
          className="min-h-[calc(100vh-64px)]"
        >
          <div
            className="
              mx-auto
              w-full
              max-w-[1600px]
              px-4
              py-5
              sm:px-6
              sm:py-6
              lg:px-7
              lg:py-7
              xl:px-8
            "
          >
            <Outlet />
          </div>
        </main>

      </div>
    </div>
  );
}
