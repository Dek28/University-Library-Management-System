import { Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Repeat, UserRound } from 'lucide-react';

import { adminApi } from '../api/endpoints';
import { BRAND } from '../constants';

const FEATURES = [
  { icon: BookOpen, title: 'Library catalogue', text: 'Books, journals, research and theses' },
  { icon: Repeat, title: 'Borrowing made simple', text: 'Loans, renewals and reservations' },
  { icon: UserRound, title: 'Your academic account', text: 'Records and library clearance' },
];

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

              <p className="mt-0.5 text-[11px] leading-tight text-[#ABC9F1]">
                University Library Management System
              </p>
            </div>

          </div>

          {/* Message */}
          <div className="my-auto max-w-[360px] py-6">

            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#8AC0FF]">
              Discover &bull; Learn &bull; Grow
            </p>

            <p className="mt-3 text-[28px] font-bold leading-[1.28] tracking-tight text-white xl:text-[38px]">
              Your gateway
              <br />
              to knowledge.
            </p>

            <p className="mt-3 max-w-[340px] text-[13px] leading-6 text-[#ABC9F1]">
              Explore academic resources and manage your library services in one secure space.
            </p>

            <ul className="mt-7 space-y-5 xl:mt-8">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-center gap-3.5">

                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#275083]">
                    <Icon className="h-4 w-4 text-[#8AC0FF]" aria-hidden="true" />
                  </span>

                  <div>
                    <p className="text-[13px] font-bold leading-tight text-white">
                      {title}
                    </p>

                    <p className="mt-0.5 text-xs text-[#ABC9F1]">
                      {text}
                    </p>
                  </div>

                </li>
              ))}
            </ul>

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

              <p className="mt-0.5 text-xs leading-tight text-[#71829A]">
                University Library Management System
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
