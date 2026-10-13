import { Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Library,
  ShieldCheck,
} from 'lucide-react';

import { adminApi } from '../api/endpoints';

export default function AuthLayout() {
  const { data: settings } = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: adminApi.publicSettings,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const institution = settings?.institution;

  const libraryName =
    institution?.libraryName || 'University Library';

  const universityName =
    institution?.universityName || 'University Library Management System';

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[44%_56%]">

      {/* Left branding panel */}
      <aside className="hidden min-h-screen bg-slate-950 text-white lg:block">

        <div className="flex min-h-screen flex-col px-12 py-10 xl:px-16">

          {/* Brand */}
          <div className="flex items-center gap-3">

            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600">
              <Library
                className="h-5 w-5 text-white"
                aria-hidden="true"
              />
            </div>

            <div>
              <p className="text-base font-semibold text-white">
                ULMS
              </p>

              <p className="text-xs text-slate-400">
                Library Management System
              </p>
            </div>

          </div>

          {/* Main branding */}
          <div className="my-auto max-w-lg">

            <p className="text-sm font-medium text-blue-400">
              University Library Management System
            </p>

            <h1 className="mt-4 max-w-md text-4xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">
              {libraryName}
            </h1>

            <p className="mt-4 max-w-md text-base leading-7 text-slate-400">
              {universityName}
            </p>

            {/* Features */}
            <div className="mt-10 max-w-md border-t border-slate-800 pt-8">

              <div className="space-y-7">

                <Feature
                  icon={BookOpen}
                  title="Library catalogue"
                  description="Search books, journals, theses and academic resources."
                />

                <Feature
                  icon={Library}
                  title="Circulation services"
                  description="Manage borrowing, returns, renewals and reservations."
                />

                <Feature
                  icon={ShieldCheck}
                  title="Account access"
                  description="View loans, reservations and library clearance."
                />

              </div>

            </div>

          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-800 pt-6 text-xs text-slate-500">

            <span>
              © {new Date().getFullYear()} {libraryName}
            </span>

            <span>
              ULMS v1.0
            </span>

          </div>

        </div>

      </aside>

      {/* Right authentication area */}
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 sm:px-8 lg:px-12">

        <div className="w-full max-w-[420px]">

          {/* Mobile identity */}
          <div className="mb-10 lg:hidden">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Library
                  className="h-5 w-5"
                  aria-hidden="true"
                />
              </div>

              <div>
                <p className="text-base font-semibold text-slate-900">
                  ULMS
                </p>

                <p className="max-w-[260px] truncate text-xs text-slate-500">
                  {libraryName}
                </p>
              </div>

            </div>

          </div>

          {/* Authentication pages */}
          <Outlet context={{ institution }} />

          {/* Mobile footer */}
          <div className="mt-10 text-center text-xs text-slate-400 lg:hidden">
            © {new Date().getFullYear()} {libraryName}
          </div>

        </div>

      </main>

    </div>
  );
}

function Feature({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-4">

      <Icon
        className="mt-0.5 h-5 w-5 shrink-0 text-blue-400"
        aria-hidden="true"
      />

      <div>
        <p className="text-sm font-medium text-white">
          {title}
        </p>

        <p className="mt-1 text-sm leading-6 text-slate-400">
          {description}
        </p>
      </div>

    </div>
  );
}