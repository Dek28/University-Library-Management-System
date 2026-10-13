import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Modal, Button, Avatar, Spinner } from '../../components/ui';
import { groupApi } from '../../api/endpoints';
import { fullName, memberIdentifier, formatDate } from '../../utils/format';

const STATUSES = [
  { value: 'present', label: 'Present', tone: 'bg-emerald-600 text-white' },
  { value: 'absent', label: 'Absent', tone: 'bg-red-600 text-white' },
  { value: 'excused', label: 'Excused', tone: 'bg-amber-500 text-white' },
];

/**
 * Marks each group member present, absent or excused.
 * Re-opening the dialog reloads whatever was saved before, so a correction
 * replaces the earlier record rather than adding to it.
 */
export default function AttendanceDialog({ session, open, onClose, onSaved }) {
  const [marks, setMarks] = useState({});
  const [busy, setBusy] = useState(false);

  const sessionId = session?.id || session?._id;

  const { data: detail, isLoading } = useQuery({
    queryKey: ['reading-group', 'session', sessionId],
    queryFn: () => groupApi.session(sessionId),
    enabled: open && Boolean(sessionId),
  });

  useEffect(() => {
    if (!detail) return;
    const existing = Object.fromEntries((detail.attendance || []).map((entry) => [
      String(entry.user?._id || entry.user?.id || entry.user),
      entry.status,
    ]));
    const members = detail.group?.members || [];
    setMarks(Object.fromEntries(members.map((member) => {
      const id = String(member.id || member._id || member);
      return [id, existing[id] || 'present'];
    })));
  }, [detail]);

  const save = async () => {
    setBusy(true);
    try {
      const entries = Object.entries(marks).map(([user, status]) => ({ user, status }));
      await groupApi.recordAttendance(sessionId, entries);
      toast.success(`Attendance recorded for ${entries.length} member(s)`);
      onSaved();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const members = detail?.group?.members || [];
  const presentCount = Object.values(marks).filter((status) => status === 'present').length;

  const setAll = (status) => {
    setMarks(Object.fromEntries(members.map((member) => [String(member.id || member._id || member), status])));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record attendance"
      description={detail ? `${detail.group?.name} · ${formatDate(detail.sessionDate)} ${detail.startTime}–${detail.endTime}` : ''}
      size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!members.length}>
            Save attendance ({presentCount}/{members.length} present)
          </Button>
        </>
      )}
    >
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      ) : !members.length ? (
        <p className="py-8 text-center text-sm text-slate-500">This group has no members to mark.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <Button key={status.value} size="sm" variant="secondary" onClick={() => setAll(status.value)}>
                Mark all {status.label.toLowerCase()}
              </Button>
            ))}
          </div>

          <ul className="divide-y divide-line rounded-md border border-line">
            {members.map((member) => {
              const id = String(member.id || member._id || member);
              return (
                <li key={id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                  <Avatar user={member} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{fullName(member)}</p>
                    <p className="truncate text-2xs text-slate-500">{memberIdentifier(member)}</p>
                  </div>
                  <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${fullName(member)}`}>
                    {STATUSES.map((status) => (
                      <button
                        key={status.value}
                        type="button"
                        role="radio"
                        aria-checked={marks[id] === status.value}
                        onClick={() => setMarks((prev) => ({ ...prev, [id]: status.value }))}
                        className={clsx(
                          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                          marks[id] === status.value ? status.tone : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                        )}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}
