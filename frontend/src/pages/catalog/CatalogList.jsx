import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, DataTable, Pagination, Button, IconButton, SearchInput,
  Select, StatusBadge, ConfirmDialog, Badge,
} from '../../components/ui';
import { resourceApi, referenceApi, authorApi } from '../../api/endpoints';
import useListQuery from '../../hooks/useListQuery';
import { useAuthStore } from '../../store/auth';
import { P, RESOURCE_TYPES } from '../../constants';
import { humanize, truncate, shelfLabel } from '../../utils/format';

const FILTER_KEYS = ['resourceType', 'category', 'author', 'shelf', 'availability'];

const VIEW_KEYS = ['page', 'limit', 'sort', 'order'];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Page, page size and sort from the URL, falling back to defaults for anything malformed. */
function readView(params) {
  const page = Number.parseInt(params.get('page'), 10);
  const limit = Number.parseInt(params.get('limit'), 10);
  const field = params.get('sort') || '';
  return {
    page: page > 0 ? page : 1,
    limit: limit > 0 && limit <= MAX_LIMIT ? limit : DEFAULT_LIMIT,
    sort: /^[a-zA-Z0-9_.]+$/.test(field)
      ? { field, direction: params.get('order') === 'desc' ? 'desc' : 'asc' }
      : null,
  };
}

/** The view as a query string holding only non-default values, e.g. "page=2&sort=title&order=desc". */
function viewKey({ page, limit, sort }) {
  const view = new URLSearchParams();
  if (Number(page) > 1) view.set('page', String(page));
  if (Number(limit) !== DEFAULT_LIMIT) view.set('limit', String(limit));
  if (sort?.field) {
    view.set('sort', sort.field);
    view.set('order', sort.direction === 'desc' ? 'desc' : 'asc');
  }
  return view.toString();
}

export default function CatalogList() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const can = useAuthStore((state) => state.can);
  // A link that arrives with filters opens the panel, so the reader can see
  // (and undo) what is applied rather than just a count on the button.
  const [showFilters, setShowFilters] = useState(() => FILTER_KEYS.some((key) => params.get(key)));
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const urlSearch = params.get('q') || '';
  // Filters live in the URL: the selects write it and the list follows it, so
  // a filtered view can be bookmarked, shared or reloaded.
  const urlFiltersKey = FILTER_KEYS.map((key) => params.get(key) || '').join('\u0000');
  const urlFilters = useMemo(() => {
    const values = urlFiltersKey.split('\u0000');
    return Object.fromEntries(FILTER_KEYS.map((key, i) => [key, values[i]]));
  }, [urlFiltersKey]);

  // Page, page size and sort are in the URL too, so a link reopens the same
  // rows. Defaults (page 1, 20 per page, no sort) are left out to keep it short.
  const urlView = readView(params);
  const urlViewKey = viewKey(urlView);

  const list = useListQuery({
    queryKey: 'resources',
    queryFn: resourceApi.search,
    initialFilters: { search: urlSearch, ...urlFilters },
    initialPage: urlView.page,
    initialLimit: urlView.limit,
    initialSort: urlView.sort,
  });

  // The search box and ?q= mirror each other. `syncedSearch` is the last term
  // both sides agreed on, so the page can tell its own URL write (ignore) from
  // an outside one such as the top bar (apply).
  const { onSearchChange, replaceFilters } = list;
  const syncedSearch = useRef(urlSearch);

  useEffect(() => {
    if (urlSearch === syncedSearch.current) return;
    syncedSearch.current = urlSearch;
    onSearchChange(urlSearch);
  }, [urlSearch, onSearchChange]);

  // Written once typing settles (the same debounce the query uses), replacing
  // the history entry so Back is not one step per keystroke.
  // setParams changes identity with every URL change; read it through a ref so
  // an outside URL change can't re-run this with a stale term and undo it.
  const settledSearch = list.params.search || '';
  const setParamsRef = useRef(setParams);
  setParamsRef.current = setParams;
  useEffect(() => {
    if (settledSearch === syncedSearch.current) return;
    syncedSearch.current = settledSearch;
    setParamsRef.current((prev) => {
      const next = new URLSearchParams(prev);
      if (settledSearch) next.set('q', settledSearch);
      else next.delete('q');
      return next;
    }, { replace: true });
  }, [settledSearch]);

  // Covers the selects below as well as links into an already-open catalogue
  // (the top bar's ?author=), where the page stays mounted. Skipped when the
  // filters are unchanged: replacing them jumps to page 1, which would throw
  // away a ?page= the catalogue was opened with.
  const syncedFilters = useRef(urlFiltersKey);
  useEffect(() => {
    if (urlFiltersKey === syncedFilters.current) return;
    syncedFilters.current = urlFiltersKey;
    replaceFilters(urlFilters);
  }, [urlFiltersKey, urlFilters, replaceFilters]);

  // Page, size and sort sync both ways, like the search box: the list changes
  // them itself (a new filter or search goes back to page 1), and the URL can
  // change them from outside (a sidebar link to plain /catalog).
  const { setPage, onLimitChange, setSort } = list;
  const syncedView = useRef(urlViewKey);

  useEffect(() => {
    if (urlViewKey === syncedView.current) return;
    syncedView.current = urlViewKey;
    const view = readView(new URLSearchParams(urlViewKey));
    onLimitChange(view.limit);
    setPage(view.page);
    setSort(view.sort);
  }, [urlViewKey, onLimitChange, setPage, setSort]);

  const stateViewKey = viewKey({ page: list.page, limit: list.limit, sort: list.sort });
  useEffect(() => {
    if (stateViewKey === syncedView.current) return;
    syncedView.current = stateViewKey;
    const view = new URLSearchParams(stateViewKey);
    setParamsRef.current((prev) => {
      const next = new URLSearchParams(prev);
      VIEW_KEYS.forEach((key) => {
        if (view.has(key)) next.set(key, view.get(key));
        else next.delete(key);
      });
      return next;
    }, { replace: true });
  }, [stateViewKey]);

  // Same for filters that arrive while the page is open (the top bar's author
  // suggestions). Only a change re-opens it, so closing it by hand sticks.
  useEffect(() => {
    if (Object.values(urlFilters).some(Boolean)) setShowFilters(true);
  }, [urlFilters]);

  // Replaces the history entry like the search box, so Back leaves the page.
  const setUrlFilter = (key, value) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  };

  // Emptying the URL clears the search, filters, page and sort through the
  // effects above. Page size is a preference rather than a filter, so it stays.
  const clearFilters = () => {
    setParams((prev) => {
      const next = new URLSearchParams();
      if (prev.has('limit')) next.set('limit', prev.get('limit'));
      return next;
    }, { replace: true });
  };

  // Reference data for the filter selects, loaded once and cached.
  const { data: categories } = useQuery({
    queryKey: ['reference', 'categories', 'options'],
    queryFn: () => referenceApi.list('categories', { limit: 200, isActive: true }),
    staleTime: 5 * 60_000,
  });
  const { data: authors } = useQuery({
    queryKey: ['authors', 'options'],
    queryFn: () => authorApi.list({ limit: 200 }),
    staleTime: 5 * 60_000,
  });
  const { data: shelves } = useQuery({
    queryKey: ['reference', 'shelves', 'options'],
    queryFn: () => referenceApi.list('shelves', { limit: 200, isActive: true }),
    staleTime: 5 * 60_000,
  });

  const remove = async () => {
    setDeleting(true);
    try {
      await resourceApi.remove(toDelete.id);
      toast.success('Catalogue record deleted');
      setToDelete(null);
      list.refetch();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleting(false);
    }
  };

  const exportAs = async (format) => {
    try {
      await resourceApi.export(list.params, format);
      toast.success(`Catalogue exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const columns = [
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      primary: true,
      render: (row) => (
        <div className="min-w-0">
          <Link to={`/catalog/${row.id}`} className="font-medium text-slate-800 hover:text-brand-600">
            {truncate(row.title, 70)}
          </Link>
          {row.subtitle && <p className="truncate text-xs text-slate-500">{truncate(row.subtitle, 60)}</p>}
        </div>
      ),
    },
    {
      key: 'authors',
      header: 'Author',
      render: (row) => (row.authors || []).map((a) => a.fullName).join(', ') || '-',
    },
    {
      key: 'category',
      header: 'Category',
      hideOnMobile: true,
      hideWhenEmpty: true,
      render: (row) => row.category?.name || '-',
    },
    { key: 'isbn', hideWhenEmpty: true, header: 'ISBN', hideOnMobile: true, render: (row) => row.isbn || '-' },
    {
      key: 'shelf',
      header: 'Shelf',
      hideOnMobile: true,
      hideWhenEmpty: true,
      render: (row) => shelfLabel(row.shelf),
    },
    {
      key: 'availableCopies',
      header: 'Copies',
      align: 'center',
      render: (row) => (
        <span className="whitespace-nowrap text-xs">
          <span className={row.availableCopies > 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-500'}>
            {row.availableCopies}
          </span>
          <span className="text-slate-400"> / {row.totalCopies}</span>
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-0.5">
          <IconButton icon={Eye} label="View details" onClick={() => navigate(`/catalog/${row.id}`)} />
          {can(P.RESOURCE_UPDATE) && (
            <IconButton icon={Pencil} label="Edit" tone="success" onClick={() => navigate(`/catalog/${row.id}/edit`)} />
          )}
          {can(P.RESOURCE_DELETE) && (
            <IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => setToDelete(row)} />
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Books Catalog"
        breadcrumbs={[{ label: 'Catalog', to: '/catalog' }, { label: 'Books' }]}
        actions={(
          <>
            <Button variant="secondary" onClick={() => exportAs('xlsx')}>Export</Button>
            {can(P.RESOURCE_CREATE) && <Button as={Link} to="/catalog/import" variant="secondary">Bulk import</Button>}
            {can(P.RESOURCE_CREATE) && <Button as={Link} to="/catalog/new">Add Book</Button>}
          </>
        )}
      />

      <Card noPadding>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <SearchInput
            value={list.search}
            onChange={(e) => list.onSearchChange(e.target.value)}
            placeholder="Search by title, author, ISBN or keyword…"
            wrapperClassName="min-w-[240px] flex-1"
            aria-label="Search the catalogue"
          />
          <Button
            variant="secondary"
            onClick={() => setShowFilters((v) => !v)}
          >
            Filters{list.activeFilterCount > 0 && ` (${list.activeFilterCount})`}
          </Button>
        </div>

        {showFilters && (
          <div className="grid gap-3 border-b border-line bg-slate-50/60 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
            <Select
              label="Resource type"
              placeholder="All types"
              options={RESOURCE_TYPES}
              value={urlFilters.resourceType}
              onChange={(e) => setUrlFilter('resourceType', e.target.value)}
            />
            <Select
              label="Category"
              placeholder="All categories"
              options={(categories?.items || []).map((c) => ({ value: c.id, label: c.name }))}
              value={urlFilters.category}
              onChange={(e) => setUrlFilter('category', e.target.value)}
            />
            <Select
              label="Author"
              placeholder="All authors"
              options={(authors?.items || []).map((a) => ({ value: a.id, label: a.fullName }))}
              value={urlFilters.author}
              onChange={(e) => setUrlFilter('author', e.target.value)}
            />
            <Select
              label="Shelf"
              placeholder="All shelves"
              options={(shelves?.items || []).map((s) => ({
                value: s.id,
                label: shelfLabel(s),
              }))}
              value={urlFilters.shelf}
              onChange={(e) => setUrlFilter('shelf', e.target.value)}
            />
            <Select
              label="Availability"
              placeholder="Any availability"
              options={[
                { value: 'available', label: 'On the shelf' },
                { value: 'unavailable', label: 'All copies out' },
              ]}
              value={urlFilters.availability}
              onChange={(e) => setUrlFilter('availability', e.target.value)}
            />
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
              <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
              <span className="text-xs text-slate-500">{list.meta.total} matching record(s)</span>
            </div>
          </div>
        )}

        <DataTable
          columns={columns}
          rows={list.items}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          sort={list.sort}
          onSortChange={list.setSort}
          emptyTitle="No catalogue records found"
          emptyDescription="Try a different search term or clear the filters."
          emptyAction={can(P.RESOURCE_CREATE)
            ? <Button as={Link} to="/catalog/new" size="sm">Add the first book</Button>
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

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={deleting}
        title="Delete this catalogue record?"
        confirmLabel="Delete record"
        message={`"${toDelete?.title}" and its ${toDelete?.totalCopies || 0} copy/copies will be removed from the catalogue. Loan history is preserved, and the deletion is refused if any copy is currently on loan.`}
      />
    </>
  );
}