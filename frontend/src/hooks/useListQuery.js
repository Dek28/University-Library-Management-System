import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import useDebounce from './useDebounce';
import { cleanParams } from '../utils/format';

/**
 * Everything a server-paginated list screen needs: page, page size, sorting,
 * a debounced search term and arbitrary filters, wired to a query function.
 *
 * Pagination, filtering and sorting all happen on the server, so the client
 * never holds a full collection in memory.
 */
export default function useListQuery({
  queryKey,
  queryFn,
  initialFilters: { search: initialSearch = '', ...initialFilters } = {},
  initialPage = 1,
  initialLimit = 20,
  initialSort = null,
  enabled = true,
  staleTime = 15_000,
}) {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  // A starting `search` seeds the search box; it is not a filter, so it never
  // counts towards the active filters or survives "Clear filters".
  const [search, setSearch] = useState(initialSearch);
  const [filters, setFilters] = useState(initialFilters);
  const [sort, setSort] = useState(initialSort);

  const debouncedSearch = useDebounce(search, 350);

  const params = useMemo(() => cleanParams({
    ...filters,
    page,
    limit,
    search: debouncedSearch || undefined,
    sort: sort?.field,
    order: sort?.direction,
  }), [filters, page, limit, debouncedSearch, sort]);

  const query = useQuery({
    queryKey: [...[].concat(queryKey), params],
    queryFn: () => queryFn(params),
    enabled,
    staleTime,
    // Keeps the previous page visible while the next one loads, so the table
    // does not collapse to a skeleton on every page change.
    placeholderData: keepPreviousData,
  });

  // Any filter change invalidates the current page number.
  const setFilter = useCallback((key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const replaceFilters = useCallback((next) => {
    setPage(1);
    setFilters(next);
  }, []);

  const resetFilters = useCallback(() => {
    setPage(1);
    setSearch('');
    setFilters(initialFilters);
    setSort(initialSort);
  }, [initialFilters, initialSort]);

  const onSearchChange = useCallback((value) => {
    setPage(1);
    setSearch(value);
  }, []);

  const onLimitChange = useCallback((value) => {
    setPage(1);
    setLimit(value);
  }, []);

  const activeFilterCount = Object.entries(filters)
    .filter(([, value]) => value !== '' && value !== undefined && value !== null && value !== 'all').length;

  return {
    items: query.data?.items || [],
    meta: query.data?.meta || { page, limit, total: 0, totalPages: 0 },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message || null,
    refetch: query.refetch,

    page,
    setPage,
    limit,
    onLimitChange,
    search,
    onSearchChange,
    filters,
    setFilter,
    replaceFilters,
    resetFilters,
    activeFilterCount,
    sort,
    setSort,
    params,
  };
}
