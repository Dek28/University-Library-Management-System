import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import dayjs from 'dayjs';
import clsx from 'clsx';
import {
  PageHeader, Card, Button, Badge, StatusBadge, Spinner, EmptyState,
} from '../../components/ui';
import { groupApi } from '../../api/endpoints';

/**
 * Day view of the reading rooms: one column per study space, sessions placed
 * in the rows they occupy. It makes double bookings visible at a glance,
 * though the API is what actually prevents them.
 */
export default function GroupSchedule() {
  const [date, setDate] = useState(dayjs());

  const { data, isLoading } = useQuery({
    queryKey: ['reading-groups', 'schedule', date.format('YYYY-MM-DD')],
    queryFn: () => groupApi.schedule({ from: date.format('YYYY-MM-DD'), to: date.format('YYYY-MM-DD') }),
    staleTime: 30_000,
  });

  const spaces = data?.spaces || [];
  const sessions = data?.sessions || [];

  const bySpace = spaces.map((space) => ({
    space,
    sessions: sessions
      .filter((session) => String(session.space?._id || session.space?.id || session.space) === String(space.id || space._id))
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }));

  const isToday = date.isSame(dayjs(), 'day');

  return (
    <>
      <PageHeader
        title="Reading room schedule"
        breadcrumbs={[{ label: 'Student Groups', to: '/reading-groups' }, { label: 'Schedule' }]}
        actions={<Button as={Link} to="/reading-groups" variant="secondary">All groups</Button>}
      />

      <Card noPadding>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDate(date.subtract(1, 'day'))} aria-label="Previous day" />
            <p className="min-w-[190px] text-center text-base font-semibold text-slate-800">
              {date.format('dddd, D MMMM YYYY')}
            </p>
            <Button variant="secondary" size="sm" onClick={() => setDate(date.add(1, 'day'))} aria-label="Next day" />
          </div>
          <div className="flex items-center gap-2">
            {!isToday && <Button variant="ghost" size="sm" onClick={() => setDate(dayjs())}>Today</Button>}
            <input
              type="date"
              value={date.format('YYYY-MM-DD')}
              onChange={(e) => setDate(dayjs(e.target.value))}
              className="h-8 rounded-md border border-slate-300 px-2 text-sm focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/25"
              aria-label="Choose a date"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : spaces.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No study spaces configured"
            description="Add rooms or tables under Administration → Reference data → Study spaces."
          />
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {bySpace.map(({ space, sessions: spaceSessions }) => (
              <div key={space.id || space._id} className="rounded-lg border border-line">
                <div className="flex items-center justify-between border-b border-line bg-slate-50 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{space.name}</p>
                    <p className="text-2xs text-slate-500">Seats {space.capacity}</p>
                  </div>
                  <Badge tone={spaceSessions.length ? 'blue' : 'slate'}>
                    {spaceSessions.length} booking{spaceSessions.length === 1 ? '' : 's'}
                  </Badge>
                </div>

                <ul className="divide-y divide-line">
                  {spaceSessions.map((session) => (
                    <li key={session._id || session.id} className="px-3.5 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            to={`/reading-groups/${session.group?._id || session.group?.id}`}
                            className="block truncate text-sm font-medium text-slate-800 hover:text-brand-600"
                          >
                            {session.group?.name}
                          </Link>
                          <p className="truncate text-2xs text-slate-500">
                            {session.topic || session.group?.readingTopic || 'Study session'}
                          </p>
                        </div>
                        <StatusBadge status={session.status} />
                      </div>
                      <p className={clsx(
                        'mt-1 inline-block rounded px-1.5 py-0.5 text-2xs font-medium',
                        session.status === 'cancelled' ? 'bg-slate-100 text-slate-500 line-through' : 'bg-brand-50 text-brand-700',
                      )}
                      >
                        {session.startTime} – {session.endTime}
                      </p>
                    </li>
                  ))}
                  {!spaceSessions.length && (
                    <li className="px-3.5 py-6 text-center text-xs text-slate-400">Free all day</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
