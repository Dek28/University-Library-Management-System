import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import { Modal, Button, Input, Select, Textarea, SearchInput } from '../../components/ui';
import { groupApi, referenceApi, userApi } from '../../api/endpoints';
import { groupSchema } from '../../validators/schemas';
import { GROUP_STATUSES } from '../../constants';
import { cleanParams, fullName, memberIdentifier } from '../../utils/format';
import useDebounce from '../../hooks/useDebounce';

/** Student picker with server-side search; selections persist across searches. */
function MemberPicker({ selected, onChange, leader, onLeaderChange }) {
  const [term, setTerm] = useState('');
  const debounced = useDebounce(term, 300);

  const { data, isFetching } = useQuery({
    queryKey: ['users', 'picker', debounced],
    queryFn: () => userApi.list({ search: debounced, roleKey: 'student', limit: 20, status: 'active' }),
    enabled: debounced.trim().length >= 2,
  });

  // Keep chosen members visible even when they fall out of the search results.
  const [known, setKnown] = useState({});
  useEffect(() => {
    if (!data?.items) return;
    setKnown((prev) => ({
      ...prev,
      ...Object.fromEntries(data.items.map((user) => [user.id, user])),
    }));
  }, [data]);

  const toggle = (user) => {
    setKnown((prev) => ({ ...prev, [user.id]: user }));
    onChange(selected.includes(user.id) ? selected.filter((id) => id !== user.id) : [...selected, user.id]);
  };

  return (
    <div>
      <p className="form-label">Members</p>
      <SearchInput
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search students by name or registration number…"
        aria-label="Search students"
      />

      {debounced.trim().length >= 2 && (
        <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-slate-300">
          {isFetching && <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>}
          {!isFetching && !(data?.items || []).length && (
            <p className="px-3 py-2 text-xs text-slate-500">No students matched “{debounced}”.</p>
          )}
          {(data?.items || []).map((user) => (
            <label key={user.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={selected.includes(user.id)}
                onChange={() => toggle(user)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                {fullName(user)} <span className="text-slate-400">· {memberIdentifier(user)}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <>
          <p className="mt-3 text-xs font-medium text-slate-600">{selected.length} member(s) selected</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {selected.map((id) => (
              <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                {known[id] ? fullName(known[id]) : id.slice(-6)}
                <button type="button" onClick={() => onChange(selected.filter((v) => v !== id))} aria-label="Remove member" className="text-slate-400 hover:text-slate-700">×</button>
              </span>
            ))}
          </div>

          <div className="mt-3">
            <Select
              label="Group leader"
              placeholder="No leader assigned"
              value={leader || ''}
              onChange={(e) => onLeaderChange(e.target.value)}
              options={selected.map((id) => ({ value: id, label: known[id] ? fullName(known[id]) : id.slice(-6) }))}
              hint="The leader is always kept as a member of the group."
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function GroupForm({ open, group, onClose, onSaved }) {
  const isEdit = Boolean(group);
  const [members, setMembers] = useState([]);
  const [leader, setLeader] = useState('');

  const { data: options } = useQuery({
    queryKey: ['groups', 'form-options'],
    queryFn: async () => {
      const [departments, faculties] = await Promise.all([
        referenceApi.list('departments', { limit: 200 }),
        referenceApi.list('faculties', { limit: 100 }),
      ]);
      return { departments: departments.items, faculties: faculties.items };
    },
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(groupSchema),
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      reset({
        name: group.name,
        readingTopic: group.readingTopic || '',
        description: group.description || '',
        department: group.department?.id || group.department || '',
        faculty: group.faculty?.id || group.faculty || '',
        academicYear: group.academicYear || '',
        status: group.status || 'planned',
        maxMembers: group.maxMembers || 20,
      });
      setMembers((group.members || []).map((m) => m.id || m));
      setLeader(group.leader?.id || group.leader || '');
    } else {
      reset({ name: '', readingTopic: '', description: '', status: 'planned', maxMembers: 20 });
      setMembers([]);
      setLeader('');
    }
  }, [open, isEdit, group, reset]);

  const onSubmit = async (values) => {
    try {
      const payload = { ...cleanParams(values), members, leader: leader || undefined };
      if (isEdit) {
        await groupApi.update(group.id, payload);
        toast.success('Reading group updated');
      } else {
        await groupApi.create(payload);
        toast.success('Reading group created');
      }
      onSaved();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit reading group' : 'Create a reading group'}
      size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button form="group-form" type="submit" loading={isSubmitting}>
            {isEdit ? 'Save changes' : 'Create group'}
          </Button>
        </>
      )}
    >
      <form id="group-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Group name" required wrapperClassName="sm:col-span-2" error={errors.name?.message} {...register('name')} />
          <Input label="Reading topic" wrapperClassName="sm:col-span-2" error={errors.readingTopic?.message} {...register('readingTopic')} />
          <Select
            label="Department"
            placeholder="Not department-specific"
            options={(options?.departments || []).map((d) => ({ value: d.id, label: d.name }))}
            {...register('department')}
          />
          <Select
            label="Faculty"
            placeholder="Not faculty-specific"
            options={(options?.faculties || []).map((f) => ({ value: f.id, label: f.name }))}
            {...register('faculty')}
          />
          <Input label="Academic year" placeholder="2026/2027" {...register('academicYear')} />
          <Select label="Status" options={GROUP_STATUSES} {...register('status')} />
          <Input
            label="Maximum members"
            type="number"
            min={2}
            max={100}
            error={errors.maxMembers?.message}
            {...register('maxMembers')}
          />
        </div>

        <Textarea label="Description" rows={3} error={errors.description?.message} {...register('description')} />

        <MemberPicker selected={members} onChange={setMembers} leader={leader} onLeaderChange={setLeader} />
      </form>
    </Modal>
  );
}
