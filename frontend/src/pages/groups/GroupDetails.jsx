import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, Button, DetailRow, StatusBadge, Badge, DataTable,
  PageLoader, ErrorState, Avatar, Modal, ConfirmDialog,
} from '../../components/ui';
import { groupApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { P } from '../../constants';
import { formatDate, fullName, memberIdentifier, humanize } from '../../utils/format';
import GroupForm from './GroupForm';
import SessionForm from './SessionForm';
import AttendanceDialog from './AttendanceDialog';

export default function GroupDetails() {
  const { id } = useParams();
  const can = useAuthStore((state) => state.can);

  const [editOpen, setEditOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [attendanceSession, setAttendanceSession] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: group, isLoading, error, refetch } = useQuery({
    queryKey: ['reading-group', id],
    queryFn: () => groupApi.get(id),
  });

  if (isLoading) return <PageLoader label="Loading reading group…" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!group) return null;

  const cancelSession = async () => {
    setBusy(true);
    try {
      await groupApi.cancelSession(cancelTarget.id || cancelTarget._id, { reason: 'Cancelled by the library' });
      toast.success('Session cancelled');
      setCancelTarget(null);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sessionColumns = [
    { key: 'sessionDate', header: 'Date', primary: true, render: (row) => formatDate(row.sessionDate) },
    { key: 'time', header: 'Time', render: (row) => `${row.startTime} – ${row.endTime}` },
    { key: 'space', header: 'Location', render: (row) => row.space?.name || '-' },
    { key: 'topic', header: 'Topic', hideOnMobile: true, render: (row) => row.topic || group.readingTopic || '-' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'attendance',
      header: 'Attendance',
      render: (row) => (row.attendanceRecorded ? <Badge tone="green">Recorded</Badge> : <Badge tone="slate">Not recorded</Badge>),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          {can(P.GROUP_ATTENDANCE) && row.status !== 'cancelled' && (
            <Button size="sm" variant="ghost" onClick={() => setAttendanceSession(row)}>
              Attendance
            </Button>
          )}
          {can(P.GROUP_MANAGE) && ['planned', 'active'].includes(row.status) && (
            <Button size="sm" variant="ghost" onClick={() => setCancelTarget(row)}>Cancel</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={group.name}
        breadcrumbs={[
          { label: 'Student Groups', to: '/reading-groups' },
          { label: group.groupCode },
        ]}
        actions={(
          <>
            <Button as={Link} to="/reading-groups" variant="secondary">Back</Button>
            {can(P.GROUP_MANAGE) && (
              <>
                <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit group</Button>
                <Button onClick={() => setSessionOpen(true)}>Schedule session</Button>
              </>
            )}
          </>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Group" className="xl:col-span-2">
          <dl className="divide-y divide-line">
            <DetailRow label="Group code">{group.groupCode}</DetailRow>
            <DetailRow label="Reading topic">{group.readingTopic || '-'}</DetailRow>
            <DetailRow label="Description">{group.description || '-'}</DetailRow>
            <DetailRow label="Leader">{fullName(group.leader) || '-'}</DetailRow>
            <DetailRow label="Department">{group.department?.name || '-'}</DetailRow>
            <DetailRow label="Faculty">{group.faculty?.name || '-'}</DetailRow>
            <DetailRow label="Academic year">{group.academicYear || '-'}</DetailRow>
            <DetailRow label="Status"><StatusBadge status={group.status} /></DetailRow>
            <DetailRow label="Created by">{fullName(group.createdBy) || '-'}</DetailRow>
          </dl>
        </Card>

        <Card title={`Members (${(group.members || []).length}/${group.maxMembers})`} noPadding>
          <ul className="divide-y divide-line">
            {(group.members || []).map((member) => (
              <li key={member.id || member} className="flex items-center gap-3 px-5 py-2.5">
                <Avatar user={member} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{fullName(member)}</p>
                  <p className="truncate text-2xs text-slate-500">{memberIdentifier(member)}</p>
                </div>
                {String(group.leader?.id || group.leader) === String(member.id || member) && (
                  <Badge tone="blue">Leader</Badge>
                )}
              </li>
            ))}
            {!(group.members || []).length && (
              <li className="px-5 py-8 text-center text-sm text-slate-500">No members yet.</li>
            )}
          </ul>
        </Card>
      </div>

      <Card className="mt-4" title="Sessions" noPadding>
        <DataTable
          columns={sessionColumns}
          rows={group.sessions || []}
          rowKey={(row) => row._id || row.id}
          emptyTitle="No sessions scheduled"
          emptyDescription="Schedule a session to book a study space for this group."
          emptyAction={can(P.GROUP_MANAGE)
            ? <Button size="sm" onClick={() => setSessionOpen(true)}>Schedule session</Button>
            : undefined}
        />
      </Card>

      <GroupForm
        open={editOpen}
        group={group}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); refetch(); }}
      />

      <SessionForm
        open={sessionOpen}
        group={group}
        onClose={() => setSessionOpen(false)}
        onSaved={() => { setSessionOpen(false); refetch(); }}
      />

      <AttendanceDialog
        session={attendanceSession}
        open={Boolean(attendanceSession)}
        onClose={() => setAttendanceSession(null)}
        onSaved={() => { setAttendanceSession(null); refetch(); }}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={cancelSession}
        loading={busy}
        title="Cancel this session?"
        confirmLabel="Cancel session"
        message="The booked study space is released and becomes available to other groups."
      />
    </>
  );
}
