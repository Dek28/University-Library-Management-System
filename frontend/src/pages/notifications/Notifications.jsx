import { useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, Button, IconButton, Select, Pagination, EmptyState, Badge,
  Modal, Input, Textarea, Spinner,
} from '../../components/ui';
import { notificationApi, adminApi } from '../../api/endpoints';
import useListQuery from '../../hooks/useListQuery';
import { useAuthStore } from '../../store/auth';
import { P } from '../../constants';
import { fromNow, humanize } from '../../utils/format';
import { useQuery } from '@tanstack/react-query';

/** Severity reads from a rule down the left edge, plus the word itself. */
const SEVERITY_RULES = {
  info: 'border-l-slate-300',
  warning: 'border-l-amber-500',
  critical: 'border-l-red-600',
};
const SEVERITY_LABELS = { info: null, warning: 'Warning', critical: 'Urgent' };

/** Sends an announcement to a role or to the whole membership. */
function BroadcastDialog({ open, onClose }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [severity, setSeverity] = useState('info');
  const [busy, setBusy] = useState(false);

  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: adminApi.roles, enabled: open, staleTime: 10 * 60_000 });

  const submit = async () => {
    setBusy(true);
    try {
      const result = await notificationApi.broadcast({ title, message, roleKey: roleKey || undefined, severity });
      toast.success(`Announcement delivered to ${result.sent} member(s)`);
      onClose();
      setTitle(''); setMessage('');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send an announcement"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={title.trim().length < 3 || message.trim().length < 3}>
            Send announcement
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Select
          label="Audience"
          placeholder="Every active member"
          options={(roles || []).map((role) => ({ value: role.key, label: role.name }))}
          value={roleKey}
          onChange={(e) => setRoleKey(e.target.value)}
        />
        <Select
          label="Severity"
          options={[
            { value: 'info', label: 'Information' },
            { value: 'warning', label: 'Warning' },
            { value: 'critical', label: 'Critical' },
          ]}
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        />
        <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea label="Message" required rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
    </Modal>
  );
}

export default function Notifications() {
  const can = useAuthStore((state) => state.can);
  const queryClient = useQueryClient();
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = useListQuery({
    queryKey: ['notifications'],
    queryFn: notificationApi.list,
    initialLimit: 25,
    initialFilters: { isRead: '', type: '' },
  });

  const refreshBadge = () => queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });

  const markAllRead = async () => {
    setBusy(true);
    try {
      await notificationApi.markAllRead();
      toast.success('All notifications marked as read');
      list.refetch();
      refreshBadge();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const markOne = async (notification) => {
    if (notification.isRead) return;
    await notificationApi.markRead([notification.id]).catch(() => {});
    list.refetch();
    refreshBadge();
  };

  const remove = async (notification) => {
    try {
      await notificationApi.remove(notification.id);
      list.refetch();
      refreshBadge();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        breadcrumbs={[{ label: 'Notifications' }]}
        actions={(
          <>
            {can(P.NOTIFICATION_BROADCAST) && (
              <Button variant="secondary" onClick={() => setBroadcastOpen(true)}>Announcement</Button>
            )}
            <Button loading={busy} onClick={markAllRead}>Mark all read</Button>
          </>
        )}
      />

      <Card noPadding>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <Select
            placeholder="All notifications"
            options={[{ value: 'false', label: 'Unread only' }, { value: 'true', label: 'Read only' }]}
            value={list.filters.isRead ?? ''}
            onChange={(e) => list.setFilter('isRead', e.target.value)}
            wrapperClassName="w-44"
            aria-label="Filter by read state"
          />
          <Select
            placeholder="All types"
            options={[
              'due_soon', 'due_reminder', 'overdue', 'fine_created', 'fine_paid',
              'reservation_ready', 'reservation_cancelled', 'reservation_expired',
              'clearance_update', 'group_session', 'system',
            ].map((type) => ({ value: type, label: humanize(type) }))}
            value={list.filters.type || ''}
            onChange={(e) => list.setFilter('type', e.target.value)}
            wrapperClassName="w-52"
            aria-label="Filter by type"
          />
        </div>

        {list.isLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : list.items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Nothing here yet"
          />
        ) : (
          <ul className="divide-y divide-line">
            {list.items.map((notification) => {
              const severityLabel = SEVERITY_LABELS[notification.severity];
              return (
                <li
                  key={notification.id}
                  className={clsx(
                    'flex gap-3.5 border-l-2 px-5 py-4',
                    SEVERITY_RULES[notification.severity] || SEVERITY_RULES.info,
                    !notification.isRead && 'bg-slate-50',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={clsx('text-sm', notification.isRead ? 'font-medium text-slate-700' : 'font-semibold text-slate-900')}>
                        {notification.title}
                      </p>
                      {severityLabel && (
                        <Badge tone={notification.severity === 'critical' ? 'red' : 'amber'}>{severityLabel}</Badge>
                      )}
                      {!notification.isRead && <Badge tone="slate">Unread</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{notification.message}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3">
                      <span className="text-2xs text-slate-400">{fromNow(notification.createdAt)}</span>
                      {notification.link && (
                        <Link
                          to={notification.link}
                          onClick={() => markOne(notification)}
                          className="text-xs font-medium text-brand-600 hover:underline"
                        >
                          Open
                        </Link>
                      )}
                      {!notification.isRead && (
                        <button
                          type="button"
                          onClick={() => markOne(notification)}
                          className="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>

                  <IconButton icon={Trash2} label="Delete notification" tone="danger" onClick={() => remove(notification)} />
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-line">
          <Pagination
            page={list.meta.page}
            limit={list.meta.limit}
            total={list.meta.total}
            onPageChange={list.setPage}
            onLimitChange={list.onLimitChange}
          />
        </div>
      </Card>

      <BroadcastDialog open={broadcastOpen} onClose={() => setBroadcastOpen(false)} />
    </>
  );
}
