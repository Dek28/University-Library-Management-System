import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, Button, DetailRow, StatusBadge, DataTable, PageLoader, ErrorState,
  Modal, ConfirmDialog, Input, Select, Textarea,
} from '../../components/ui';
import { purchaseOrderApi, referenceApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { P, SUPPLIER_PAYMENT_METHODS } from '../../constants';
import {
  formatDate, formatDateTime, formatInputDate, formatMoney, fullName, humanize, shelfLabel,
} from '../../utils/format';

const itemId = (item) => item._id || item.id;

/** Books arriving from the supplier: how many of each line, and where they go. */
function ReceiveDialog({ order, open, onClose, onDone }) {
  const outstanding = order.items.filter((i) => i.quantity > i.receivedQuantity);
  const [quantities, setQuantities] = useState({});
  const [shelves, setShelves] = useState({});
  const [busy, setBusy] = useState(false);

  const { data: shelfList } = useQuery({
    queryKey: ['reference', 'shelves', 'options'],
    queryFn: () => referenceApi.list('shelves', { limit: 200 }),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const shelfOptions = (shelfList?.items || []).map((s) => ({ value: s.id, label: shelfLabel(s) }));

  const qty = (item) => quantities[itemId(item)] ?? item.quantity - item.receivedQuantity;

  const submit = async () => {
    const lines = outstanding
      .map((item) => ({ item: itemId(item), quantity: Number(qty(item)), shelf: shelves[itemId(item)] || undefined }))
      .filter((l) => l.quantity > 0);
    if (!lines.length) { toast.error('Enter a received quantity for at least one book'); return; }

    setBusy(true);
    try {
      const result = await purchaseOrderApi.receive(order.id, { lines });
      const total = result.received.reduce((s, l) => s + l.quantity, 0);
      toast.success(`Received ${total} copy/copies into stock`);
      setQuantities({});
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Receive delivery"
      description="Copies are added to the catalogue with new barcodes. Titles not yet catalogued are created automatically."
      size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Receive into stock</Button>
        </>
      )}
    >
      <div className="space-y-4">
        {outstanding.map((item) => (
          <div key={itemId(item)} className="rounded-lg border border-line p-3">
            <p className="text-sm font-medium text-slate-800">{item.title}</p>
            <p className="mb-2 text-xs text-slate-500">
              Ordered {item.quantity} · received so far {item.receivedQuantity}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Received now"
                type="number"
                min={0}
                max={item.quantity - item.receivedQuantity}
                value={qty(item)}
                onChange={(e) => setQuantities((q) => ({ ...q, [itemId(item)]: e.target.value }))}
              />
              <Select
                label="Shelf"
                placeholder={item.shelf ? shelfLabel(item.shelf) : 'No shelf'}
                options={shelfOptions}
                value={shelves[itemId(item)] || ''}
                onChange={(e) => setShelves((s) => ({ ...s, [itemId(item)]: e.target.value }))}
              />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Records that the library has paid the supplier's invoice. */
function PaymentDialog({ order, open, onClose, onDone, symbol }) {
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(formatInputDate(new Date()));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await purchaseOrderApi.pay(order.id, { method, reference, paidAt });
      toast.success('Payment recorded. The invoice now prints as a paid receipt.');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record payment"
      description={`Settles invoice ${order.invoiceNumber} in full: ${formatMoney(order.totalAmount, symbol)}.`}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Mark as paid</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Select label="Method" options={SUPPLIER_PAYMENT_METHODS} value={method} onChange={(e) => setMethod(e.target.value)} />
        <Input label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transfer ID, cheque no., receipt no." />
        <Input label="Payment date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
      </div>
    </Modal>
  );
}

export default function OrderDetails() {
  const { id } = useParams();
  const can = useAuthStore((state) => state.can);
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const queryClient = useQueryClient();

  const [dialog, setDialog] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => purchaseOrderApi.get(id),
  });

  if (isLoading) return <PageLoader label="Loading order…" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!order) return null;

  const refresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
  };

  const run = async (action, message) => {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      setDialog(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const manage = can(P.INVENTORY_MANAGE);
  const isDraft = order.status === 'draft';
  const awaiting = ['ordered', 'partially_received'].includes(order.status);
  const placed = !isDraft && order.status !== 'cancelled';
  const unpaid = order.paymentStatus !== 'paid';
  const canCancel = ['draft', 'ordered'].includes(order.status) && unpaid;
  const documentLabel = isDraft ? 'order form' : 'invoice';

  const download = () => purchaseOrderApi.downloadInvoice(order.id, order.invoiceNumber || order.orderCode)
    .catch((e) => toast.error(e.message));
  const print = () => purchaseOrderApi.printInvoice(order.id).catch((e) => toast.error(e.message));

  const itemColumns = [
    {
      key: 'title',
      header: 'Title',
      primary: true,
      render: (row) => (
        <div>
          {row.resource
            ? <Link to={`/catalog/${row.resource.id || row.resource}`} className="font-medium text-brand-600 hover:underline">{row.title}</Link>
            : <span className="font-medium text-slate-800">{row.title}</span>}
          {row.authors && <p className="text-xs text-slate-500">{row.authors}</p>}
        </div>
      ),
    },
    { key: 'isbn', header: 'ISBN', hideOnMobile: true, render: (row) => row.isbn || '-' },
    { key: 'quantity', header: 'Ordered', align: 'right' },
    {
      key: 'receivedQuantity',
      header: 'Received',
      align: 'right',
      render: (row) => (
        <span className={row.receivedQuantity >= row.quantity ? 'font-medium text-emerald-600' : ''}>{row.receivedQuantity}</span>
      ),
    },
    { key: 'unitPrice', header: 'Unit price', align: 'right', render: (row) => formatMoney(row.unitPrice, symbol) },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatMoney(row.quantity * (row.unitPrice || 0), symbol) },
  ];

  const receiptColumns = [
    { key: 'title', header: 'Title', primary: true },
    { key: 'quantity', header: 'Copies', align: 'right' },
    { key: 'shelf', header: 'Shelf', render: (row) => shelfLabel(row.shelf) },
    { key: 'receivedBy', header: 'Received by', hideOnMobile: true, render: (row) => fullName(row.receivedBy) || '-' },
    { key: 'receivedAt', header: 'Date', render: (row) => formatDateTime(row.receivedAt) },
  ];

  return (
    <>
      <PageHeader
        title={`Order ${order.orderCode}`}
        breadcrumbs={[{ label: 'Book Orders', to: '/orders' }, { label: order.orderCode }]}
        actions={(
          <>
            <Button as={Link} to="/orders" variant="secondary">Back</Button>
            <Button variant="secondary" onClick={print}>Print {documentLabel}</Button>
            <Button variant="secondary" onClick={download}>Download PDF</Button>
            {manage && isDraft && <Button as={Link} to={`/orders/${order.id}/edit`} variant="secondary">Edit</Button>}
            {manage && canCancel && <Button variant="secondary" onClick={() => setDialog('cancel')}>Cancel order</Button>}
            {manage && isDraft && <Button onClick={() => setDialog('place')}>Place order</Button>}
            {manage && awaiting && <Button onClick={() => setDialog('receive')}>Receive delivery</Button>}
            {manage && placed && unpaid && <Button variant="success" onClick={() => setDialog('pay')}>Record payment</Button>}
          </>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Order" className="xl:col-span-2">
          <dl className="divide-y divide-line">
            <DetailRow label="Order number">{order.orderCode}</DetailRow>
            <DetailRow label="Invoice number">{order.invoiceNumber || 'Issued when the order is placed'}</DetailRow>
            <DetailRow label="Status"><StatusBadge status={order.status} /></DetailRow>
            <DetailRow label="Supplier">{order.supplier}</DetailRow>
            <DetailRow label="Contact">{order.supplierContact}</DetailRow>
            <DetailRow label="Address">{order.supplierAddress}</DetailRow>
            <DetailRow label="Created">{`${formatDateTime(order.createdAt)}${order.createdBy ? ` by ${fullName(order.createdBy)}` : ''}`}</DetailRow>
            <DetailRow label="Ordered on">{order.orderedAt ? formatDate(order.orderedAt) : null}</DetailRow>
            <DetailRow label="Expected">{order.expectedDate ? formatDate(order.expectedDate) : null}</DetailRow>
            <DetailRow label="Received on">{order.receivedAt ? formatDate(order.receivedAt) : null}</DetailRow>
            <DetailRow label="Cancelled">{order.cancelledAt ? `${formatDate(order.cancelledAt)}${order.cancelReason ? ` – ${order.cancelReason}` : ''}` : null}</DetailRow>
            <DetailRow label="Notes">{order.notes}</DetailRow>
          </dl>
        </Card>

        <div className="space-y-4">
          <Card title="Invoice">
            <dl className="divide-y divide-line">
              <DetailRow label="Subtotal">{formatMoney(order.subtotal, symbol)}</DetailRow>
              {order.discount > 0 && <DetailRow label="Discount">-{formatMoney(order.discount, symbol)}</DetailRow>}
              {order.taxRate > 0 && <DetailRow label={`Tax (${order.taxRate}%)`}>{formatMoney(order.taxAmount, symbol)}</DetailRow>}
              {order.shippingCost > 0 && <DetailRow label="Shipping">{formatMoney(order.shippingCost, symbol)}</DetailRow>}
            </dl>
            <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 px-3.5 py-3">
              <span className="text-sm font-medium text-slate-600">Total</span>
              <span className="text-md font-semibold text-slate-900 tabular">{formatMoney(order.totalAmount, symbol)}</span>
            </div>
          </Card>

          {placed && (
            <Card title="Payment">
              <dl className="divide-y divide-line">
                <DetailRow label="Status"><StatusBadge status={order.paymentStatus} /></DetailRow>
                <DetailRow label="Paid on">{order.paidAt ? formatDate(order.paidAt) : null}</DetailRow>
                <DetailRow label="Method">{order.paymentMethod ? humanize(order.paymentMethod) : null}</DetailRow>
                <DetailRow label="Reference">{order.paymentReference}</DetailRow>
                <DetailRow label="Recorded by">{fullName(order.paidBy)}</DetailRow>
              </dl>
              {order.paymentStatus === 'paid' && (
                <Button className="mt-3 w-full" variant="secondary" onClick={print}>Print payment receipt</Button>
              )}
            </Card>
          )}
        </div>
      </div>

      <Card
        className="mt-4"
        title="Books"
        subtitle={`${order.items.length} title(s) · ${order.items.reduce((s, i) => s + i.quantity, 0)} copies`}
        noPadding
      >
        <DataTable columns={itemColumns} rows={order.items} rowKey={itemId} emptyTitle="No books on this order" />
      </Card>

      {order.receipts?.length > 0 && (
        <Card className="mt-4" title="Deliveries received" noPadding>
          <DataTable columns={receiptColumns} rows={order.receipts} rowKey={itemId} />
        </Card>
      )}

      <ConfirmDialog
        open={dialog === 'place'}
        onClose={() => setDialog(null)}
        onConfirm={() => run(() => purchaseOrderApi.place(order.id), 'Order placed and invoice issued')}
        loading={busy}
        tone="primary"
        title="Place this order?"
        confirmLabel="Place order"
        message={`The order is sent to ${order.supplier} for ${formatMoney(order.totalAmount, symbol)} and an invoice number is issued. It can no longer be edited.`}
      />

      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        onConfirm={() => run(() => purchaseOrderApi.cancel(order.id, { reason: cancelReason }), 'Order cancelled')}
        loading={busy}
        title="Cancel this order?"
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        message="The order is kept for the record but nothing more can be received or paid against it."
      >
        <div className="mt-3">
          <Textarea label="Reason (optional)" rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </div>
      </ConfirmDialog>

      {awaiting && (
        <ReceiveDialog order={order} open={dialog === 'receive'} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {placed && unpaid && (
        <PaymentDialog order={order} symbol={symbol} open={dialog === 'pay'} onClose={() => setDialog(null)} onDone={refresh} />
      )}
    </>
  );
}
