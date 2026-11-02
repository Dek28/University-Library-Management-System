import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Upload, Download, Eye, FileText, Trash2, Lock, LayoutGrid, List, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  PageHeader, Card, Button, IconButton, SearchInput, Select, Badge, Pagination,
  DataTable, ConfirmDialog, EmptyState,
} from '../../components/ui';
import { digitalApi, referenceApi } from '../../api/endpoints';
import useListQuery from '../../hooks/useListQuery';
import { useAuthStore } from '../../store/auth';
import { P, RESOURCE_TYPES, ACCESS_LEVELS } from '../../constants';
import { formatBytes, humanize, truncate } from '../../utils/format';
import UploadDialog from './UploadDialog';

const ACCESS_TONES = {
  public: 'green', university: 'blue', students: 'blue',
  staff: 'purple', librarians: 'amber', restricted: 'red',
};

/** Grid card for one repository item. */
function ItemCard({ item, onDownload, onDelete, canManage }) {
  const navigate = useNavigate();
  const readUrl = `/digital-library/${item.id}/read`;
  return (
    <div className="group flex flex-col rounded-lg border border-line bg-panel p-3 transition-colors hover:border-brand-300">
      <Link
        to={readUrl}
        className="mb-3 flex h-28 items-center justify-center rounded bg-slate-100 transition-colors group-hover:bg-brand-50"
        aria-label={`Read ${item.title}`}
        tabIndex={-1}
      >
        <FileText className="h-8 w-8 text-slate-300 group-hover:text-brand-400" aria-hidden="true" />
      </Link>

      <Link to={readUrl} className="line-clamp-2 text-sm font-semibold text-slate-800 hover:text-brand-600">
        {item.title}
      </Link>
      <p className="mt-1 truncate text-xs text-slate-500">
        {(item.authorNames || []).join(', ') || humanize(item.resourceType)}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="slate">{item.mimeType?.includes('pdf') ? 'PDF' : humanize(item.resourceType)}</Badge>
        <Badge tone={ACCESS_TONES[item.accessLevel] || 'slate'}>
          {item.accessLevel === 'public' ? 'Public' : humanize(item.accessLevel)}
        </Badge>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
        <span className="text-2xs text-slate-400">{formatBytes(item.fileSize)}</span>
        <div className="flex gap-0.5">
          <IconButton icon={BookOpen} label="Read" tone="success" onClick={() => navigate(readUrl)} />
          <IconButton icon={Eye} label="View details" onClick={() => navigate(`/digital-library/${item.id}`)} />
          {item.isDownloadable
            ? <IconButton icon={Download} label="Download" tone="success" onClick={() => onDownload(item)} />
            : <IconButton icon={Lock} label="Reading access only" tone="muted" />}
          {canManage && <IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => onDelete(item)} />}
        </div>
      </div>
    </div>
  );
}

export default function DigitalLibrary() {
  const navigate = useNavigate();
  const can = useAuthStore((state) => state.can);
  const [view, setView] = useState('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const list = useListQuery({
    queryKey: 'digital-resources',
    queryFn: digitalApi.list,
    initialLimit: 24,
    initialFilters: { resourceType: '', accessLevel: '', department: '' },
  });

  const { data: departments } = useQuery({
    queryKey: ['reference', 'departments', 'options'],
    queryFn: () => referenceApi.list('departments', { limit: 200 }),
    staleTime: 5 * 60_000,
  });

  const download = async (item) => {
    try {
      await digitalApi.download(item.id, item.originalName);
      toast.success('Download started');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await digitalApi.remove(toDelete.id);
      toast.success('Repository item deleted');
      setToDelete(null);
      list.refetch();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      key: 'title',
      header: 'Title',
      primary: true,
      render: (row) => (
        <Link to={`/digital-library/${row.id}/read`} className="font-medium text-slate-800 hover:text-brand-600">
          {truncate(row.title, 60)}
        </Link>
      ),
    },
    { key: 'authorNames', header: 'Author', render: (row) => (row.authorNames || []).join(', ') || '-' },
    { key: 'resourceType', header: 'Type', render: (row) => humanize(row.resourceType) },
    { key: 'year', header: 'Year', align: 'center', hideOnMobile: true },
    { key: 'department', hideWhenEmpty: true, header: 'Department', hideOnMobile: true, render: (row) => row.department?.name || '-' },
    {
      key: 'accessLevel',
      header: 'Access',
      render: (row) => <Badge tone={ACCESS_TONES[row.accessLevel] || 'slate'}>{humanize(row.accessLevel)}</Badge>,
    },
    { key: 'fileSize', header: 'Size', align: 'right', hideOnMobile: true, render: (row) => formatBytes(row.fileSize) },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-0.5">
          <IconButton icon={BookOpen} label="Read" tone="success" onClick={() => navigate(`/digital-library/${row.id}/read`)} />
          <IconButton icon={Eye} label="View details" onClick={() => navigate(`/digital-library/${row.id}`)} />
          {row.isDownloadable && <IconButton icon={Download} label="Download" tone="success" onClick={() => download(row)} />}
          {can(P.DIGITAL_MANAGE) && <IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => setToDelete(row)} />}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Digital Library"
        breadcrumbs={[{ label: 'Digital Library' }, { label: 'Repository' }]}
        actions={can(P.DIGITAL_UPLOAD) && <Button onClick={() => setUploadOpen(true)}>Upload resource</Button>}
      />

      <Card noPadding>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <SearchInput
            value={list.search}
            onChange={(e) => list.onSearchChange(e.target.value)}
            placeholder="Search e-books, theses, papers…"
            wrapperClassName="min-w-[220px] flex-1"
            aria-label="Search the repository"
          />
          <Button variant="secondary" onClick={() => setShowFilters((v) => !v)}>
            Filters{list.activeFilterCount > 0 && ` (${list.activeFilterCount})`}
          </Button>
          <div className="flex rounded-md border border-slate-300">
            <button
              type="button"
              onClick={() => setView('grid')}
              className={clsx('flex h-9 w-9 items-center justify-center rounded-l-md', view === 'grid' ? 'bg-brand-50 text-brand-600' : 'text-slate-500 hover:bg-slate-50')}
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={clsx('flex h-9 w-9 items-center justify-center rounded-r-md border-l border-slate-300', view === 'list' ? 'bg-brand-50 text-brand-600' : 'text-slate-500 hover:bg-slate-50')}
              aria-label="List view"
              aria-pressed={view === 'list'}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="grid gap-3 border-b border-line bg-slate-50/60 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Resource type"
              placeholder="All types"
              options={RESOURCE_TYPES}
              value={list.filters.resourceType || ''}
              onChange={(e) => list.setFilter('resourceType', e.target.value)}
            />
            <Select
              label="Access level"
              placeholder="Any access level"
              options={ACCESS_LEVELS}
              value={list.filters.accessLevel || ''}
              onChange={(e) => list.setFilter('accessLevel', e.target.value)}
            />
            <Select
              label="Department"
              placeholder="All departments"
              options={(departments?.items || []).map((d) => ({ value: d.id, label: d.name }))}
              value={list.filters.department || ''}
              onChange={(e) => list.setFilter('department', e.target.value)}
            />
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={list.resetFilters}>Clear filters</Button>
            </div>
          </div>
        )}

        {view === 'grid' ? (
          <div className="p-5">
            {list.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                {Array.from({ length: 10 }).map((unused, index) => <div key={index} className="skeleton h-56 rounded-lg" />)}
              </div>
            ) : list.items.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Nothing in the repository yet"
                action={can(P.DIGITAL_UPLOAD) ? <Button size="sm" onClick={() => setUploadOpen(true)}>Upload the first item</Button> : undefined}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                {list.items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onDownload={download}
                    onDelete={setToDelete}
                    canManage={can(P.DIGITAL_MANAGE)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={list.items}
            loading={list.isLoading}
            error={list.error}
            onRetry={list.refetch}
            emptyTitle="Nothing in the repository yet"
          />
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

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onSaved={() => { setUploadOpen(false); list.refetch(); }} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={busy}
        title="Delete this repository item?"
        confirmLabel="Delete item"
        message={`"${toDelete?.title}" will be removed from the repository. The stored file is retained so the deletion can be reversed by an operator.`}
      />
    </>
  );
}
