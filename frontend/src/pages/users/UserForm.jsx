import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, Button, Input, PasswordInput, Select, Textarea, PageLoader, ErrorState,
} from '../../components/ui';
import { userApi, adminApi, referenceApi } from '../../api/endpoints';
import { userSchema, createUserSchema } from '../../validators/schemas';
import { GENDERS } from '../../constants';
import { cleanParams, formatInputDate } from '../../utils/format';

export default function UserForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const { data: existing, isLoading, error } = useQuery({
    queryKey: ['user', id],
    queryFn: () => userApi.get(id),
    enabled: isEdit,
  });

  const { data: options } = useQuery({
    queryKey: ['users', 'form-options'],
    queryFn: async () => {
      const [roles, faculties, departments, programs] = await Promise.all([
        adminApi.roles(),
        referenceApi.list('faculties', { limit: 100 }),
        referenceApi.list('departments', { limit: 200 }),
        referenceApi.list('programs', { limit: 200 }),
      ]);
      return { roles, faculties: faculties.items, departments: departments.items, programs: programs.items };
    },
    staleTime: 5 * 60_000,
  });

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(isEdit ? userSchema : createUserSchema),
    defaultValues: { gender: 'undisclosed', role: 'student' },
  });

  useEffect(() => {
    if (!existing) return;
    reset({
      firstName: existing.firstName,
      middleName: existing.middleName || '',
      lastName: existing.lastName,
      email: existing.email,
      phone: existing.phone || '',
      address: existing.address || '',
      gender: existing.gender || 'undisclosed',
      registrationNumber: existing.registrationNumber || '',
      employeeId: existing.employeeId || '',
      role: existing.role?.id || existing.role?.key || '',
      faculty: existing.faculty?.id || '',
      department: existing.department?.id || '',
      program: existing.program?.id || '',
      academicYear: existing.academicYear || '',
      yearOfStudy: existing.yearOfStudy || '',
      semester: existing.semester || '',
      graduationYear: existing.graduationYear || '',
      notes: existing.notes || '',
    });
  }, [existing, reset]);

  if (isEdit && isLoading) return <PageLoader label="Loading member…" />;
  if (isEdit && error) return <ErrorState message={error.message} />;

  // Student-only fields are hidden for staff roles to keep the form honest.
  const selectedRole = watch('role');
  const roleRecord = (options?.roles || []).find((r) => r.id === selectedRole || r.key === selectedRole);
  const isStudent = !roleRecord || roleRecord.key === 'student';

  const onSubmit = async (values) => {
    try {
      const payload = cleanParams(values);
      const saved = isEdit
        ? await userApi.update(id, payload)
        : await userApi.create(payload);
      toast.success(isEdit ? 'Member updated' : 'Member created');
      navigate(`/users/${saved.id}`);
    } catch (err) {
      toast.error(err.message);
      (err.errors || []).forEach((fieldError) => toast.error(`${fieldError.field}: ${fieldError.message}`));
    }
  };

  const asOptions = (items = []) => items.map((item) => ({ value: item.id, label: item.name }));

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit member' : 'Add User'}
        breadcrumbs={[{ label: 'Users', to: '/users' }, { label: isEdit ? 'Edit' : 'Add' }]}
        actions={<Button as={Link} to={isEdit ? `/users/${id}` : '/users'} variant="secondary">Cancel</Button>}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Card title="Personal details">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input label="First name" required error={errors.firstName?.message} {...register('firstName')} />
            <Input label="Middle name" error={errors.middleName?.message} {...register('middleName')} />
            <Input label="Last name" required error={errors.lastName?.message} {...register('lastName')} />
            <Input label="Email address" type="email" required error={errors.email?.message} {...register('email')} />
            <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
            <Select label="Gender" options={GENDERS} {...register('gender')} />
            <Input label="Address" wrapperClassName="sm:col-span-2 lg:col-span-3" error={errors.address?.message} {...register('address')} />
          </div>
        </Card>

        <Card title="Library account">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select
              label="Role"
              required
              placeholder="Choose a role"
              options={(options?.roles || []).map((role) => ({ value: role.id, label: role.name }))}
              hint="You cannot assign a role at or above your own authority level."
              error={errors.role?.message}
              {...register('role')}
            />
            <Input
              label="Registration number"
              hint={isStudent ? 'Required for students' : 'Leave blank for staff'}
              error={errors.registrationNumber?.message}
              {...register('registrationNumber')}
            />
            <Input
              label="Staff ID"
              hint={isStudent ? 'Leave blank for students' : 'Required for staff'}
              error={errors.employeeId?.message}
              {...register('employeeId')}
            />

            {!isEdit && (
              <PasswordInput
                label="Initial password"
                required
                wrapperClassName="sm:col-span-2 lg:col-span-3"
                hint="At least 8 characters, with an uppercase letter, a lowercase letter and a number."
                error={errors.password?.message}
                {...register('password')}
              />
            )}
          </div>
        </Card>

        <Card title="Academic details">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select label="Faculty" placeholder="Not assigned" options={asOptions(options?.faculties)} {...register('faculty')} />
            <Select label="Department" placeholder="Not assigned" options={asOptions(options?.departments)} {...register('department')} />
            {isStudent && (
              <>
                <Select label="Program" placeholder="Not assigned" options={asOptions(options?.programs)} {...register('program')} />
                <Input label="Academic year" placeholder="2026/2027" {...register('academicYear')} />
                <Input label="Year of study" type="number" min={1} max={10} error={errors.yearOfStudy?.message} {...register('yearOfStudy')} />
                <Input label="Semester" type="number" min={1} max={3} error={errors.semester?.message} {...register('semester')} />
                <Input label="Expected graduation year" type="number" error={errors.graduationYear?.message} {...register('graduationYear')} />
              </>
            )}
          </div>
        </Card>

        <Card title="Notes">
          <Textarea label="Internal notes" rows={3} hint="Visible to library staff only." {...register('notes')} />
        </Card>

        <div className="flex justify-end gap-2">
          <Button as={Link} to={isEdit ? `/users/${id}` : '/users'} variant="secondary">Cancel</Button>
          <Button type="submit" loading={isSubmitting}>
            {isEdit ? 'Save changes' : 'Create member'}
          </Button>
        </div>
      </form>
    </>
  );
}
