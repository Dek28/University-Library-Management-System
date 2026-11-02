import { Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';

import { adminApi } from '../api/endpoints';
import { BRAND } from '../constants';

/**
 * Shell for the sign-in, forgot-password and reset-password screens.
 *
 * A navy brand panel on the left (hidden below the `lg` breakpoint) and, on the
 * right, a white card on a pale background that holds whichever auth page is
 * showing. Always light, whatever theme the rest of the app is using.
 */
export default function AuthLayout() {
  const { data: settings } = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: adminApi.publicSettings,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const institution = settings?.institution;

  return (
    <div className="theme-light min-h-screen bg-[#F1F5FB] font-inter text-[#12233C] lg:grid lg:grid-cols-[40%_60%]">

      {/* Brand panel */}
      <aside className="hidden bg-[#102D55] text-white lg:block">

        <div className="flex min-h-screen flex-col px-8 py-7 xl:px-11">

          {/* Brand */}
          <div className="flex items-center gap-3">

            <img
              src={BRAND.logo}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full ring-[1.5px] ring-[#D8ECFF]"
            />

            <div>
              <p className="text-base font-bold leading-tight text-white">
                {BRAND.name}
              </p>

            </div>

          </div>

          {/* Message */}
          <div className="my-auto max-w-[360px] py-6">
            <p className="text-[28px] font-bold leading-[1.28] tracking-tight text-white xl:text-[38px]">
              Your gateway
              <br />
              to knowledge.
            </p>
          </div>

        </div>

      </aside>

      {/* Authentication area */}
      <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 lg:px-12">

        <div className="w-full max-w-[400px]">

          {/* Brand, shown where the panel is hidden */}
          <div className="mb-6 flex items-center gap-3 lg:hidden">

            <img
              src={BRAND.logo}
              alt=""
              className="h-12 w-12 shrink-0"
            />

            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight text-[#12233C]">
                {BRAND.name}
              </p>

            </div>

          </div>

          {/* Authentication pages */}
          <div className="rounded-[20px] border border-[#E1E9F3] bg-white px-6 py-8 sm:px-8">
            <Outlet context={{ institution }} />
          </div>

        </div>

      </main>

    </div>
  );
}
