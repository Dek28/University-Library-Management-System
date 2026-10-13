import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, DataTable, Pagination, Button, IconButton, SearchInput,
  Modal, Input, Textarea, Select, Checkbox, Badge, Tabs,
} from '../../components/ui';
import { referenceApi } from '../../api/endpoints';
import useListQuery from '../../hooks/useListQuery';
import { useAuthStore } from '../../store/auth';
import { P } from '../../constants';
import { referenceSchemaFor } from '../../validators/schemas';
import { cleanParams, humanize } from '../../utils/format';

/**
 * One screen for every configurable vocabulary.
 * Each collection declares only the extra fields it needs; the shared name,
 * description and active flag are handled once. Only faculties, departments
 * and programs have a code (`hasCode`). A shelf is just a section and a rack
 * (`isShelf`); the API derives its name from them.
 */
const COLLECTIONS = [
  { key: 'faculties', label: 'Faculties', hasCode: true, extra: [{ name: 'dean', label: 'Dean', type: 'text' }] },
  {
    key: 'departments',
    label: 'Departments',
    hasCode: true,
    extra: [
      { name: 'faculty', label: 'Faculty', type: 'ref', collection: 'faculties', required: true },
      { name: 'head', label: 'Head of department', type: 'text' },
    ],
    columns: [{ key: 'faculty', header: 'Faculty', render: (row) => row.faculty?.name || '-' }],
  },
  {
    key: 'programs',
    label: 'Programs',
    hasCode: true,
    extra: [
      { name: 'department', label: 'Department', type: 'ref', collection: 'departments', required: true },
      {
        name: 'level',
        label: 'Level',
        type: 'select',
        options: ['certificate', 'diploma', 'bachelor', 'master', 'phd', 'other'].map((v) => ({ value: v, label: humanize(v) })),
      },
      { name: 'durationYears', label: 'Duration (years)', type: 'number' },
    ],
    columns: [
      { key: 'department', header: 'Department', render: (row) => row.department?.name || '-' },
      { key: 'level', header: 'Level', render: (row) => humanize(row.level) },
    ],
  },
  {
    key: 'categories',
    label: 'Categories',
    noDescription: true,
    extra: [{ name: 'deweyRange', label: 'Dewey range', type: 'text' }],
    columns: [{ key: 'deweyRange', header: 'Dewey range' }],
  },
  {
    key: 'subjects',
    label: 'Subjects',
    noDescription: true,
    extra: [{ name: 'category', label: 'Category', type: 'ref', collection: 'categories' }],
    columns: [{ key: 'category', header: 'Category', render: (row) => row.category?.name || '-' }],
  },
  {
    key: 'publishers',
    label: 'Publishers',
    extra: [
      { name: 'country', label: 'Country', type: 'text' },
      { name: 'website', label: 'Website', type: 'text' },
      { name: 'contactEmail', label: 'Contact email', type: 'text' },
    ],
    columns: [{ key: 'country', header: 'Country' }],
  },
  { key: 'languages', label: 'Languages', noDescription: true, extra: [] },
  {
    key: 'shelves',
    label: 'Shelves',
    singular: 'Shelf',
    isShelf: true,
    extra: [
      { name: 'section', label: 'Section name', type: 'text', required: true, placeholder: 'e.g. Health Sciences' },
      { name: 'rack', label: 'Rack number', type: 'text', required: true, placeholder: 'e.g. 4' },
    ],
  },
  {
    key: 'study-spaces',
    label: 'Study spaces',
    extra: [
      {
        name: 'spaceType',
        label: 'Type',
        type: 'select',
        options: ['room', 'table', 'carrel', 'hall'].map((v) => ({ value: v, label: humanize(v) })),
      },
      { name: 'capacity', label: 'Seats', type: 'number' },
      { name: 'location', label: 'Location', type: 'text' },
    ],
    columns: [
      { key: 'spaceType', header: 'Type', render: (row) => humanize(row.spaceType) },
      { key: 'capacity', header: 'Seats', align: 'right' },
      { key: 'location', hideWhenEmpty: true, header: 'Location' },
    ],
  },
];

/** "Categories" -> "Category"; irregular plurals declare `singular`. */
const singularOf = (definition) => definition.singular
  || definition.label.replace(/ies$/, 'y').replace(/s$/, '');

function ReferenceForm({ collection, record, open, onClose, onSaved }) {
  const definition = COLLECTIONS.find((c) => c.key === collection);
  const isEdit = Boolean(record);
  const hasDescription = !definition.isShelf && !definition.noDescription;

  // Load option lists for any `ref` fields this collection declares.
  const refFields = (definition.extra || []).filter((field) => field.type === 'ref');
  const { data: refOptions } = useQuery({
    queryKey: ['reference', 'options', collection],
    queryFn: async () => {
      const entries = await Promise.all(refFields.map(async (field) => {
        const result = await referenceApi.list(field.collection, { limit: 200 });
        return [field.name, result.items];
      }));
      return Object.fromEntries(entries);
    },
    enabled: open && refFields.length > 0,
    staleTime: 5 * 60_000,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(referenceSchemaFor(definition)),
  });

  useEffect(() => {
    if (!open) return;
    const values = { isActive: isEdit ? record.isActive : true };
    if (definition.hasCode) values.code = isEdit ? record.code : '';
    if (!definition.isShelf) values.name = isEdit ? record.name : '';
    if (hasDescription) values.description = isEdit ? record.description || '' : '';
    (definition.extra || []).forEach((field) => {
      const value = isEdit ? record[field.name] : '';
      values[field.name] = value && typeof value === 'object' ? (value.id || value._id) : (value ?? '');
    });
    reset(values);
  }, [open, isEdit, record, definition, reset]);

  const onSubmit = async (values) => {
    try {
      const payload = cleanParams(values);
      payload.isActive = Boolean(values.isActive);
      if (isEdit) {
        await referenceApi.update(collection, record.id, payload);
        toast.success('Record updated');
      } else {
        await referenceApi.create(collection, payload);
        toast.success('Record created');
      }
      onSaved();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const singular = singularOf(definition);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${singular.toLowerCase()}` : `Add ${singular.toLowerCase()}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button form="reference-form" type="submit" loading={isSubmitting}>
            {isEdit ? 'Save changes' : 'Create'}
          </Button>
        </>
      )}
    >
      <form id="reference-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {!definition.isShelf && (
          <div className={definition.hasCode ? 'grid gap-4 sm:grid-cols-2' : ''}>
            {definition.hasCode && (
              <Input label="Code" required hint="Short unique code, e.g. CS" error={errors.code?.message} {...register('code')} />
            )}
            <Input label="Name" required error={errors.name?.message} {...register('name')} />
          </div>
        )}

        {(definition.extra || []).length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {definition.extra.map((field) => {
              if (field.type === 'ref') {
                return (
                  <Select
                    key={field.name}
                    label={field.label}
                    required={field.required}
                    placeholder="Not set"
                    options={(refOptions?.[field.name] || []).map((item) => ({ value: item.id, label: item.name }))}
                    {...register(field.name)}
                  />
                );
              }
              if (field.type === 'select') {
                return <Select key={field.name} label={field.label} options={field.options} {...register(field.name)} />;
              }
              return (
                <Input
                  key={field.name}
                  label={field.label}
                  required={field.required}
                  placeholder={field.placeholder}
                  type={field.type === 'number' ? 'number' : 'text'}
                  error={errors[field.name]?.message}
                  {...register(field.name)}
                />
              );
            })}
          </div>
        )}

        {hasDescription && <Textarea label="Description" rows={2} {...register('description')} />}
        <Checkbox label="Active" {...register('isActive')} />
      </form>
    </Modal>
  );
}

export default function ReferenceData() {
  const can = useAuthStore((state) => state.can);
  const [collection, setCollection] = useState('faculties');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const definition = COLLECTIONS.find((c) => c.key === collection);

  const list = useListQuery({
    queryKey: ['reference', collection],
    queryFn: (params) => referenceApi.list(collection, params),
    initialLimit: 25,
  });

  const remove = async () => {
    setBusy(true);
    try {
      await referenceApi.remove(collection, toDelete.id);
      toast.success('Record deleted');
      setToDelete(null);
      list.refetch();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const strong = (text) => <span className="font-medium text-slate-800">{text || '-'}</span>;
  const identityColumns = definition.isShelf
    ? [
      { key: 'section', header: 'Section', primary: true, render: (row) => strong(row.section) },
      { key: 'rack', header: 'Rack', render: (row) => row.rack || '-' },
    ]
    : [
      ...(definition.hasCode ? [{ key: 'code', header: 'Code', primary: true, render: (row) => strong(row.code) }] : []),
      definition.hasCode
        ? { key: 'name', header: 'Name' }
        : { key: 'name', header: 'Name', primary: true, render: (row) => strong(row.name) },
    ];

  const columns = [
    ...identityColumns,
    ...(definition.columns || []).map((column) => ({ ...column, hideOnMobile: true })),
    {
      key: 'isActive',
      header: 'Status',
      render: (row) => (row.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (can(P.REFERENCE_MANAGE) ? (
        <div className="flex justify-end gap-0.5">
          <IconButton icon={Pencil} label="Edit" tone="success" onClick={() => { setEditing(row); setFormOpen(true); }} />
          <IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => setToDelete(row)} />
        </div>
      ) : null),
    },
  ];

  return (
    <>
      <PageHeader
        title="Reference data"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Reference data' }]}
        actions={can(P.REFERENCE_MANAGE) && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            Add {singularOf(definition).toLowerCase()}
          </Button>
        )}
      />

      <Card noPadding>
        <Tabs
          className="px-2"
          tabs={COLLECTIONS.map((c) => ({ key: c.key, label: c.label }))}
          value={collection}
          onChange={(key) => { setCollection(key); list.resetFilters(); }}
        />

        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <SearchInput
            value={list.search}
            onChange={(e) => list.onSearchChange(e.target.value)}
            placeholder={`Search ${definition.label.toLowerCase()}…`}
            wrapperClassName="min-w-[220px] flex-1"
            aria-label={`Search ${definition.label}`}
          />
        </div>

        <DataTable
          columns={columns}
          rows={list.items}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          emptyTitle={`No ${definition.label.toLowerCase()} configured`}
          emptyAction={can(P.REFERENCE_MANAGE)
            ? <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>Add the first one</Button>
            : undefined}
        />

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

      <ReferenceForm
        collection={collection}
        record={editing}
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={() => { setFormOpen(false); setEditing(null); list.refetch(); }}
      />

      <ConfirmDeleteDialog
        record={toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        busy={busy}
      />
    </>
  );
}

/** Split out so the copy can explain why a delete may be refused. */
function ConfirmDeleteDialog({ record, onClose, onConfirm, busy }) {
  return (
    <Modal
      open={Boolean(record)}
      onClose={onClose}
      title="Delete this record?"
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>Delete</Button>
        </>
      )}
    >
      <p className="text-sm text-slate-600">
        <span className="font-medium text-slate-800">{record?.name}</span> will be deleted. If catalogue
        records or members still reference it, the deletion is refused. Deactivate it instead so
        existing data stays intact.
      </p>
    </Modal>
  );
}
