import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { Modal, Button, Input, Select, Textarea } from '../../components/ui';
import { groupApi, referenceApi } from '../../api/endpoints';
import { sessionSchema } from '../../validators/schemas';
import { cleanParams } from '../../utils/format';

/**
 * Books a study space for a group.
 *
 * The API refuses an overlapping booking for the same space; that conflict is
 * surfaced here as a clear message naming the group already holding the slot.
 */
export default function SessionForm({ open, group, session, onClose, onSaved }) {
  const isEdit = Boolean(session);

  const { data: spaces } = useQuery({
    queryKey: ['reference', 'study-spaces', 'options'],
    queryFn: () => referenceApi.list('study-spaces', { limit: 100, isActive: true }),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(sessionSchema),
  });

  useEffect(() => {
    if (!open) return;
    reset(isEdit
      ? {
        group: group.id,
        topic: session.topic || '',
        sessionDate: dayjs(session.sessionDate).format('YYYY-MM-DD'),
        startTime: session.startTime,
        endTime: session.endTime,
        space: session.space?.id || session.space,
        expectedAttendees: session.expectedAttendees || '',
        notes: session.notes || '',
      }
      : {
        group: group.id,
        topic: group.readingTopic || '',
        sessionDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
        startTime: '14:00',
        endTime: '16:00',
        space: '',
        expectedAttendees: (group.members || []).length || '',
        notes: '',
      });
  }, [open, isEdit, group, session, reset]);

  const onSubmit = async (values) => {
    try {
      const payload = cleanParams(values);
      if (isEdit) {
        await groupApi.updateSession(session.id || session._id, payload);
        toast.success('Session updated');
      } else {
        await groupApi.scheduleSession({ ...payload, group: group.id });
        toast.success('Session scheduled');
      }
      onSaved();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const spaceOptions = (spaces?.items || []).map((space) => ({
    value: space.id,
    label: `${space.name} (seats ${space.capacity})`,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Reschedule session' : 'Schedule a session'}
      description={group?.name}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button form="session-form" type="submit" loading={isSubmitting}>
            {isEdit ? 'Save changes' : 'Schedule session'}
          </Button>
        </>
      )}
    >
      <form id="session-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input label="Topic" error={errors.topic?.message} {...register('topic')} />

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Date"
            type="date"
            required
            min={dayjs().format('YYYY-MM-DD')}
            error={errors.sessionDate?.message}
            {...register('sessionDate')}
          />
          <Input label="Start time" type="time" required error={errors.startTime?.message} {...register('startTime')} />
          <Input label="End time" type="time" required error={errors.endTime?.message} {...register('endTime')} />
        </div>

        <Select
          label="Study space"
          required
          placeholder="Choose a room or table"
          options={spaceOptions}
          error={errors.space?.message}
          {...register('space')}
        />

        <Input
          label="Expected attendees"
          type="number"
          min={0}
          hint="Must not exceed the capacity of the chosen space."
          error={errors.expectedAttendees?.message}
          {...register('expectedAttendees')}
        />

        <Textarea label="Notes" rows={2} error={errors.notes?.message} {...register('notes')} />

        <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="text-xs text-amber-800">
            A space cannot be booked twice over the same period. If the slot is taken, the conflicting
            group is named in the error so you can pick another time or room.
          </p>
        </div>
      </form>
    </Modal>
  );
}
