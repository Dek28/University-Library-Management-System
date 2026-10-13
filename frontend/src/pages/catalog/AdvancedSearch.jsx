import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, BookOpen } from 'lucide-react';
import {
  PageHeader, Card, Button, Input, Select, DataTable, Pagination, StatusBadge,
} from '../../components/ui';
import { resourceApi, referenceApi, authorApi } from '../../api/endpoints';
import { RESOURCE_TYPES } from '../../constants';
import { cleanParams, truncate } from '../../utils/format';

const BLANK = {
  title: '', author: '', isbn: '', subject: '', category: '',
  department: '', keyword: '', availability: '', resourceType: '',
  yearFrom: '', yearTo: '',
};

/**
 * Field-by-field catalogue search.
 *
 * Nothing is queried until the form is submitted, so a librarian can compose a
 * precise query without firing a request per keystroke.
 */
export default function AdvancedSearch() {
  const [form, setForm] = useState(BLANK);
  const [criteria, setCriteria] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const options = useQuery({
    queryKey: ['search', 'options'],
    queryFn: async () => {
      const [categories, subjects, departments, authors] = await Promise.all([
        referenceApi.list('categories', { limit: 200 }),
        referenceApi.list('subjects', { limit: 200 }),
        referenceApi.list('departments', { limit: 200 }),
        authorApi.list({ limit: 200 }),
      ]);
      return {
        categories: categories.items,
        subjects: subjects.items,
        departments: departments.items,
        authors: authors.items,
      };
    },
    staleTime: 5 * 60_000,
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['advanced-search', criteria, page, limit],
    queryFn: () => resourceApi.search({ ...criteria, page, limit }),
    enabled: Boolean(criteria),
    placeholderData: keepPreviousData,
  });

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = (event) => {
    event.preventDefault();
    setPage(1);
    // `title` maps onto the API's free-text term.
    const { title, ...rest } = form;
    setCriteria(cleanParams({ ...rest, q: title }));
  };

  const reset = () => {
    setForm(BLANK);
    setCriteria(null);
    setPage(1);
  };

  const asOptions = (items = [], labelKey = 'name') => items.map((item) => ({ value: item.id, label: item[labelKey] }));

  const columns = [
    {
      key: 'title',
      header: 'Title',
      primary: true,
      render: (row) => (
        <Link to={`/catalog/${row.id}`} className="font-medium text-slate-800 hover:text-brand-600">
          {truncate(row.title, 70)}
        </Link>
      ),
    },
    { key: 'authors', header: 'Author', render: (row) => (row.authors || []).map((a) => a.fullName).join(', ') || '-' },
    { key: 'category', hideWhenEmpty: true, header: 'Category', hideOnMobile: true, render: (row) => row.category?.name || '-' },
    { key: 'publicationYear', header: 'Year', align: 'center', hideOnMobile: true },
    {
      key: 'availableCopies',
      header: 'Available',
      align: 'center',
      render: (row) => `${row.availableCopies} / ${row.totalCopies}`,
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Advanced Search"
        breadcrumbs={[{ label: 'Catalog', to: '/catalog' }, { label: 'Search' }]}
      />

      <Card>
        <form onSubmit={submit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input label="Title" placeholder="Enter title" value={form.title} onChange={(e) => update('title', e.target.value)} />
            <Select
              label="Author"
              placeholder="Any author"
              options={asOptions(options.data?.authors, 'fullName')}
              value={form.author}
              onChange={(e) => update('author', e.target.value)}
            />
            <Input label="ISBN" placeholder="Enter ISBN" value={form.isbn} onChange={(e) => update('isbn', e.target.value)} />
            <Select
              label="Subject"
              placeholder="Any subject"
              options={asOptions(options.data?.subjects)}
              value={form.subject}
              onChange={(e) => update('subject', e.target.value)}
            />

            <Select
              label="Category"
              placeholder="Any category"
              options={asOptions(options.data?.categories)}
              value={form.category}
              onChange={(e) => update('category', e.target.value)}
            />
            <Select
              label="Department"
              placeholder="Any department"
              options={asOptions(options.data?.departments)}
              value={form.department}
              onChange={(e) => update('department', e.target.value)}
            />
            <Input label="Keyword" placeholder="Enter keyword" value={form.keyword} onChange={(e) => update('keyword', e.target.value)} />
            <Select
              label="Availability"
              placeholder="All"
              options={[
                { value: 'available', label: 'On the shelf' },
                { value: 'unavailable', label: 'All copies out' },
              ]}
              value={form.availability}
              onChange={(e) => update('availability', e.target.value)}
            />

            <Select
              label="Resource type"
              placeholder="All types"
              options={RESOURCE_TYPES}
              value={form.resourceType}
              onChange={(e) => update('resourceType', e.target.value)}
            />
            <Input label="Published from" type="number" placeholder="1990" value={form.yearFrom} onChange={(e) => update('yearFrom', e.target.value)} />
            <Input label="Published to" type="number" placeholder="2026" value={form.yearTo} onChange={(e) => update('yearTo', e.target.value)} />
          </div>

          <div className="mt-5 flex gap-2">
            <Button type="submit" loading={isFetching && Boolean(criteria)}>Search</Button>
            <Button type="button" variant="secondary" onClick={reset}>Reset</Button>
          </div>
        </form>
      </Card>

      {criteria && (
        <Card
          className="mt-4"
          title="Search results"
          subtitle={`${data?.meta?.total || 0} record(s) matched`}
          noPadding
        >
          <DataTable
            columns={columns}
            rows={data?.items || []}
            loading={isLoading}
            error={error?.message}
            onRetry={refetch}
            emptyTitle="No matches"
            emptyDescription="Loosen one or two criteria and search again."
          />
          <div className="border-t border-line">
            <Pagination
              page={data?.meta?.page || 1}
              limit={data?.meta?.limit || limit}
              total={data?.meta?.total || 0}
              onPageChange={setPage}
              onLimitChange={(value) => { setLimit(value); setPage(1); }}
            />
          </div>
        </Card>
      )}

      {!criteria && (
        <Card className="mt-4">
          <div className="flex flex-col items-center py-10 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-slate-800">Compose a search</p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Fill in one or more fields above, then choose Search. Empty fields are ignored.
            </p>
          </div>
        </Card>
      )}
    </>
  );
}
