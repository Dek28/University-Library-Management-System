import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, StatCard, DataTable, Pagination, Button, SearchInput, Select, StatusBadge, Tabs,
} from '../../components/ui';
import { purchaseOrderApi } from '../../api/endpoints';
import useListQuery from '../../hooks/useListQuery';
import { useAuthStore } from '../../store/auth';
import { P, ORDER_STATUSES } from '../../constants';
import { formatDate, formatMoney, formatNumber } from '../../utils/format';

/** Book orders placed with suppliers, with their invoices. */
export default function PurchaseOrders() {
  const can = useAuthStore((state) => state.can);
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const navigate = useNavigate();

  const list = useListQuery({
    queryKey: ['purchase-orders'],
    queryFn: purchaseOrderApi.list,
    initialFilters: { status: '', paymentStatus: '' },
  });

  const { data: summary = {} } = useQuery({
    queryKey: ['purchase-orders', 'summary'],
    queryFn: purchaseOrderApi.summary,
  });

  // Exports what the list currently shows: same tab, payment filter and search.
  const exportAs = async (format) => {
    try {
      await purchaseOrderApi.export(list.params, format);
      toast.success(`Exported as ${format === 'xlsx' ? 'Excel' : 'PDF'}`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const count = (status) => summary[status]?.count || 0;
  const open = ['ordered', 'partially_received'];
  const openValue = open.reduce((sum, s) => sum + (summary[s]?.amount || 0), 0);
  const total = ORDER_STATUSES.reduce((sum, s) => sum + count(s.value), 0);

  const tabs = [
    { key: '', label: 'All', count: total },
    ...ORDER_STATUSES.map((s) => ({ key: s.value, label: s.label, count: count(s.value) })),
  ];

  const columns = [
    {
      key: 'orderCode',
      header: 'Order',
      primary: true,
      render: (row) => (
        <Link to={`/orders/${row.id}`} className="font-medium text-slate-800 hover:text-brand-600">
          {row.orderCode}
        </Link>
      ),
    },
    { key: 'invoiceNumber', header: 'Invoice', hideOnMobile: true, render: (row) => row.invoiceNumber || '-' },
    { key: 'supplier', header: 'Supplier' },
    {
      key: 'items',
      header: 'Books',
      align: 'right',
      render: (row) => formatNumber((row.items || []).reduce((sum, i) => sum + i.quantity, 0)),
    },
    { key: 'totalAmount', header: 'Total', align: 'right', render: (row) => formatMoney(row.totalAmount, symbol) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'paymentStatus',
      header: 'Payment',
      render: (row) => (row.status === 'draft' || row.status === 'cancelled' ? '-' : <StatusBadge status={row.paymentStatus} />),
    },
    { key: 'createdAt', header: 'Created', hideOnMobile: true, render: (row) => formatDate(row.createdAt) },
  ];

  return (
    <>
      <PageHeader
        title="Book Orders"
        breadcrumbs={[{ label: 'Catalogue' }, { label: 'Book Orders' }]}
        actions={(
          <>
            <Button variant="secondary" onClick={() => exportAs('pdf')}>PDF</Button>
            <Button variant="secondary" onClick={() => exportAs('xlsx')}>Excel</Button>
            {can(P.INVENTORY_MANAGE) && <Button as={Link} to="/orders/new">New order</Button>}
          </>
        )}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Drafts" value={count('draft')} tone="slate" />
        <StatCard label="Awaiting delivery" value={count('ordered') + count('partially_received')} tone="amber" />
        <StatCard label="Received" value={count('received')} tone="green" />
        <StatCard label="Value on order" value={formatMoney(openValue, symbol)} tone="blue" />
      </div>

      <Card noPadding>
        <Tabs className="px-3 pt-1" tabs={tabs} value={list.filters.status} onChange={(key) => list.setFilter('status', key)} />
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <SearchInput
            value={list.search}
            onChange={(e) => list.onSearchChange(e.target.value)}
            placeholder="Search order, invoice, supplier or title…"
            wrapperClassName="min-w-[220px] flex-1"
            aria-label="Search orders"
          />
          <Select
            aria-label="Payment status"
            wrapperClassName="sm:w-48"
            value={list.filters.paymentStatus}
            onChange={(e) => list.setFilter('paymentStatus', e.target.value)}
            options={[
              { value: '', label: 'Any payment' },
              { value: 'unpaid', label: 'Unpaid' },
              { value: 'paid', label: 'Paid' },
            ]}
          />
        </div>
        <DataTable
          columns={columns}
          rows={list.items}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          onRowClick={(row) => navigate(`/orders/${row.id}`)}
          emptyTitle="No orders found"
          emptyDescription="Create an order to buy new books for the library."
          emptyAction={can(P.INVENTORY_MANAGE) ? <Button size="sm" as={Link} to="/orders/new">New order</Button> : undefined}
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
    </>
  );
}
