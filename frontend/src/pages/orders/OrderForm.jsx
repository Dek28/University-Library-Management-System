import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Trash2, X } from 'lucide-react';
import {
  PageHeader, Card, Button, IconButton, Input, Textarea, PageLoader, ErrorState,
} from '../../components/ui';
import { purchaseOrderApi, resourceApi } from '../../api/endpoints';
import useDebounce from '../../hooks/useDebounce';
import { useAuthStore } from '../../store/auth';
import { formatInputDate, formatMoney } from '../../utils/format';

const emptyLine = () => ({
  key: crypto.randomUUID(), resource: null, title: '', authors: '', isbn: '', quantity: 1, unitPrice: '',
});

/** Search box that links an order line to a title already in the catalogue. */
function CataloguePicker({ onPick }) {
  const [term, setTerm] = useState('');
  const debounced = useDebounce(term.trim(), 300);

  const { data, isFetching } = useQuery({
    queryKey: ['orders', 'catalogue-picker', debounced],
    queryFn: () => resourceApi.search({ search: debounced, limit: 6 }),
    enabled: debounced.length >= 2,
  });
  const results = data?.items || [];

  return (
    <div className="relative">
      <Input
        label="Find in catalogue"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search by title or ISBN to re-order an existing book"
        hint="Or leave this empty and type the details of a new title below."
      />
      {debounced.length >= 2 && term && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-panel py-1 shadow-overlay">
          {isFetching && results.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Searching…</li>}
          {!isFetching && results.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matching titles</li>}
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-50"
                onClick={() => { onPick(r); setTerm(''); }}
              >
                <span className="text-sm font-medium text-slate-800">{r.title}</span>
                <span className="text-xs text-slate-500">
                  {[(r.authors || []).map((a) => a.fullName).filter(Boolean).join(', '), r.isbn].filter(Boolean).join(' · ') || 'No ISBN'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderLine({ line, index, onChange, onRemove, canRemove, symbol }) {
  const set = (field) => (e) => onChange({ ...line, [field]: e.target.value });
  const amount = Number(line.quantity || 0) * Number(line.unitPrice || 0);

  return (
    <div className="rounded-lg border border-line p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Book {index + 1}</p>
        {canRemove && <IconButton icon={Trash2} label="Remove this book" tone="danger" onClick={onRemove} />}
      </div>

      {line.resource ? (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-md bg-slate-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">{line.title}</p>
            <p className="text-xs text-slate-500">{[line.authors, line.isbn].filter(Boolean).join(' · ') || 'From the catalogue'}</p>
          </div>
          <IconButton
            icon={X}
            label="Unlink from catalogue"
            tone="muted"
            onClick={() => onChange({ ...line, resource: null })}
          />
        </div>
      ) : (
        <div className="mb-3 space-y-3">
          <CataloguePicker
            onPick={(r) => onChange({
              ...line,
              resource: r.id,
              title: r.title,
              isbn: r.isbn || '',
              authors: (r.authors || []).map((a) => a.fullName).filter(Boolean).join('; '),
              unitPrice: line.unitPrice || r.purchasePrice || '',
            })}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Title" required wrapperClassName="sm:col-span-3" value={line.title} onChange={set('title')} />
            <Input label="Author(s)" wrapperClassName="sm:col-span-2" value={line.authors} onChange={set('authors')} placeholder="Separate with ;" />
            <Input label="ISBN" value={line.isbn} onChange={set('isbn')} />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Quantity" type="number" min={1} required value={line.quantity} onChange={set('quantity')} />
        <Input label={`Unit price (${symbol})`} type="number" min={0} step="0.01" value={line.unitPrice} onChange={set('unitPrice')} />
        <div>
          <p className="form-label">Line total</p>
          <p className="flex h-9 items-center text-base font-semibold text-slate-800 tabular">{formatMoney(amount, symbol)}</p>
        </div>
      </div>
    </div>
  );
}

/** Create a new book order, or edit one that is still a draft. */
export default function OrderForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';

  const [form, setForm] = useState({
    supplier: '', supplierContact: '', supplierAddress: '', expectedDate: '', notes: '',
    discount: '', taxRate: '', shippingCost: '',
  });
  const [lines, setLines] = useState([emptyLine()]);
  const [busy, setBusy] = useState(false);

  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => purchaseOrderApi.get(id),
    enabled: editing,
  });

  useEffect(() => {
    if (!order) return;
    setForm({
      supplier: order.supplier || '',
      supplierContact: order.supplierContact || '',
      supplierAddress: order.supplierAddress || '',
      expectedDate: formatInputDate(order.expectedDate),
      notes: order.notes || '',
      discount: order.discount || '',
      taxRate: order.taxRate || '',
      shippingCost: order.shippingCost || '',
    });
    setLines(order.items.map((item) => ({
      key: item._id || item.id,
      resource: item.resource?.id || item.resource?._id || item.resource || null,
      title: item.title,
      authors: item.authors || '',
      isbn: item.isbn || '',
      quantity: item.quantity,
      unitPrice: item.unitPrice || '',
    })));
  }, [order]);

  if (editing && isLoading) return <PageLoader label="Loading order…" />;
  if (editing && error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (editing && order && order.status !== 'draft') {
    return <ErrorState message="Only a draft order can be edited." onRetry={() => navigate(`/orders/${id}`)} />;
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  // Mirrors the server's calculation so the figures on screen match the invoice.
  const subtotal = lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const discounted = Math.max(0, subtotal - Number(form.discount || 0));
  const tax = Math.round(discounted * (Number(form.taxRate || 0) / 100) * 100) / 100;
  const total = discounted + tax + Number(form.shippingCost || 0);

  const submit = async (event) => {
    event.preventDefault();
    if (form.supplier.trim().length < 2) { toast.error('Enter the supplier name'); return; }
    if (lines.some((l) => !l.resource && !l.title.trim())) { toast.error('Every book needs a title'); return; }
    if (lines.some((l) => Number(l.quantity) < 1)) { toast.error('Every quantity must be at least 1'); return; }

    const payload = {
      ...form,
      expectedDate: form.expectedDate || null,
      discount: Number(form.discount || 0),
      taxRate: Number(form.taxRate || 0),
      shippingCost: Number(form.shippingCost || 0),
      items: lines.map((l) => ({
        resource: l.resource || undefined,
        title: l.title,
        authors: l.authors,
        isbn: l.isbn,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice || 0),
      })),
    };

    setBusy(true);
    try {
      const saved = editing ? await purchaseOrderApi.update(id, payload) : await purchaseOrderApi.create(payload);
      toast.success(editing ? 'Order updated' : 'Draft order created');
      navigate(`/orders/${saved.id}`);
    } catch (err) {
      toast.error(err.errors?.[0]?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <PageHeader
        title={editing ? `Edit order ${order?.orderCode || ''}` : 'New book order'}
        breadcrumbs={[
          { label: 'Book Orders', to: '/orders' },
          { label: editing ? order?.orderCode || 'Edit' : 'New order' },
        ]}
        actions={(
          <>
            <Button as={Link} to={editing ? `/orders/${id}` : '/orders'} variant="secondary">Cancel</Button>
            <Button type="submit" loading={busy}>{editing ? 'Save changes' : 'Save as draft'}</Button>
          </>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="Supplier">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Supplier name" required value={form.supplier} onChange={set('supplier')} placeholder="e.g. Campus Book Distributors Ltd" />
              <Input label="Contact (email / phone)" value={form.supplierContact} onChange={set('supplierContact')} />
              <Input label="Address" wrapperClassName="sm:col-span-2" value={form.supplierAddress} onChange={set('supplierAddress')} />
              <Input label="Expected delivery" type="date" value={form.expectedDate} onChange={set('expectedDate')} />
            </div>
          </Card>

          <Card
            title="Books to order"
            subtitle={`${lines.length} title(s), ${lines.reduce((s, l) => s + Number(l.quantity || 0), 0)} copies`}
            actions={<Button size="sm" variant="secondary" onClick={() => setLines((ls) => [...ls, emptyLine()])}>Add book</Button>}
          >
            <div className="space-y-4">
              {lines.map((line, index) => (
                <OrderLine
                  key={line.key}
                  line={line}
                  index={index}
                  symbol={symbol}
                  canRemove={lines.length > 1}
                  onChange={(next) => setLines((ls) => ls.map((l) => (l.key === line.key ? next : l)))}
                  onRemove={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                />
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Invoice totals">
            <div className="space-y-3">
              <Input label={`Discount (${symbol})`} type="number" min={0} step="0.01" value={form.discount} onChange={set('discount')} />
              <Input label="Tax rate (%)" type="number" min={0} max={100} step="0.01" value={form.taxRate} onChange={set('taxRate')} />
              <Input label={`Shipping (${symbol})`} type="number" min={0} step="0.01" value={form.shippingCost} onChange={set('shippingCost')} />
            </div>
            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular">{formatMoney(subtotal, symbol)}</dd></div>
              {Number(form.discount) > 0 && (
                <div className="flex justify-between"><dt className="text-slate-500">Discount</dt><dd className="tabular">-{formatMoney(form.discount, symbol)}</dd></div>
              )}
              {Number(form.taxRate) > 0 && (
                <div className="flex justify-between"><dt className="text-slate-500">Tax ({form.taxRate}%)</dt><dd className="tabular">{formatMoney(tax, symbol)}</dd></div>
              )}
              {Number(form.shippingCost) > 0 && (
                <div className="flex justify-between"><dt className="text-slate-500">Shipping</dt><dd className="tabular">{formatMoney(form.shippingCost, symbol)}</dd></div>
              )}
            </dl>
            <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 px-3.5 py-3">
              <span className="text-sm font-medium text-slate-600">Total</span>
              <span className="text-md font-semibold text-slate-900 tabular">{formatMoney(total, symbol)}</span>
            </div>
          </Card>

          <Card title="Notes">
            <Textarea label="Notes for the supplier" rows={4} value={form.notes} onChange={set('notes')} />
          </Card>
        </div>
      </div>
    </form>
  );
}
