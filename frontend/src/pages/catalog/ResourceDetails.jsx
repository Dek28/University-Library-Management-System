import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Pencil, BookOpen, Upload, Trash2, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, Button, IconButton, StatusBadge, Badge, DetailRow,
  PageLoader, ErrorState, DataTable, Modal, ConfirmDialog, Barcode,
} from '../../components/ui';
import { resourceApi, copyApi, reservationApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import { P } from '../../constants';
import { formatDate, formatMoney, humanize, shelfLabel } from '../../utils/format';
import CopyForm from './CopyForm';

export default function ResourceDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const can = useAuthStore((state) => state.can);
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';

  const [copyFormOpen, setCopyFormOpen] = useState(false);
  const [editingCopy, setEditingCopy] = useState(null);
  const [copyToDelete, setCopyToDelete] = useState(null);
  const [labelCopy, setLabelCopy] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: resource, isLoading, error, refetch } = useQuery({
    queryKey: ['resource', id],
    queryFn: () => resourceApi.get(id),
  });

  const { data: related = [] } = useQuery({
    queryKey: ['resource', id, 'related'],
    queryFn: () => resourceApi.related(id),
    enabled: Boolean(resource),
    staleTime: 60_000,
  });

  if (isLoading) return <PageLoader label="Loading catalogue record…" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!resource) return null;

  const reserve = async () => {
    setBusy(true);
    try {
      await reservationApi.create({ resource: id });
      toast.success('Reservation placed. You will be notified when a copy is ready.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteCopy = async () => {
    setBusy(true);
    try {
      await copyApi.remove(copyToDelete.id);
      toast.success('Copy removed from circulation');
      setCopyToDelete(null);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Shelf where the book is kept: the book's own shelf first,
   * then the first copy's shelf for records created before shelves existed.
   */
  const shelf = resource.shelf || resource.copiesList?.[0]?.shelf;
  const shelfLocation = shelfLabel(shelf);

  const copyColumns = [
    { key: 'accessionNumber', header: 'Accession number', primary: true, render: (row) => <span className="font-medium text-slate-800">{row.accessionNumber}</span> },
    { key: 'barcode', header: 'Barcode', render: (row) => <span className="font-mono text-xs">{row.barcode}</span> },
    { key: 'shelf', hideWhenEmpty: true, header: 'Location', render: (row) => shelfLabel(row.shelf) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'condition', header: 'Condition', hideOnMobile: true, render: (row) => humanize(row.condition) },
    { key: 'borrowCount', header: 'Loans', align: 'right', hideOnMobile: true },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-0.5">
          <IconButton icon={Printer} label="Print label" tone="muted" onClick={() => setLabelCopy(row)} />
          {can(P.COPY_MANAGE) && (
            <>
              <IconButton icon={Pencil} label="Edit copy" tone="success" onClick={() => { setEditingCopy(row); setCopyFormOpen(true); }} />
              <IconButton icon={Trash2} label="Remove copy" tone="danger" onClick={() => setCopyToDelete(row)} />
            </>
          )}
        </div>
      ),
    },
  ];

  const canReserve = can(P.RESERVATION_CREATE_OWN) && resource.availableCopies === 0 && resource.isBorrowable;

  return (
    <>
      <PageHeader
        title="Book Details"
        breadcrumbs={[{ label: 'Catalog', to: '/catalog' }, { label: 'Books', to: '/catalog' }, { label: resource.title }]}
        actions={(
          <>
            <Button as={Link} to="/catalog" variant="secondary">Back to Catalog</Button>
            {canReserve && <Button variant="secondary" loading={busy} onClick={reserve}>Reserve</Button>}
            {can(P.RESOURCE_UPDATE) && (
              <Button as={Link} to={`/catalog/${id}/edit`}>Edit Book</Button>
            )}
          </>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="mx-auto w-40 shrink-0 sm:mx-0">
              <div className="flex aspect-3/4 items-center justify-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-line">
                {resource.coverImage
                  ? <img src={resource.coverImage} alt={`Cover of ${resource.title}`} className="h-full w-full object-cover" />
                  : <BookOpen className="h-10 w-10 text-slate-300" aria-hidden="true" />}
              </div>
              {can(P.RESOURCE_UPDATE) && (
                <label className="mt-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-slate-300 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Change cover
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      try {
                        await resourceApi.uploadCover(id, file);
                        toast.success('Cover image updated');
                        refetch();
                      } catch (err) {
                        toast.error(err.message);
                      }
                    }}
                  />
                </label>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold leading-snug text-slate-900">{resource.title}</h2>
                  {resource.subtitle && <p className="mt-0.5 text-sm text-slate-500">{resource.subtitle}</p>}
                </div>
                <StatusBadge status={resource.status} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="blue">{humanize(resource.resourceType)}</Badge>
                {resource.isReferenceOnly && <Badge tone="purple">Reference only</Badge>}
                {!resource.isBorrowable && <Badge tone="slate">Not for loan</Badge>}
                {resource.activeReservations > 0 && <Badge tone="amber">{resource.activeReservations} on hold</Badge>}
              </div>

              <dl className="mt-4 divide-y divide-line">
                <DetailRow label="Author">{(resource.authors || []).map((a) => a.fullName).join(', ') || '-'}</DetailRow>
                <DetailRow label="ISBN">{resource.isbn || '-'}</DetailRow>
                <DetailRow label="Category">{resource.category?.name || '-'}</DetailRow>
                <DetailRow label="Publisher">{resource.publisher?.name || '-'}</DetailRow>
                <DetailRow label="Published year">{resource.publicationYear || '-'}</DetailRow>
                <DetailRow label="Edition">
                  {/^\d+(st|nd|rd|th)$/.test(resource.edition || '') ? `${resource.edition} Edition` : resource.edition || '-'}
                </DetailRow>
                <DetailRow label="Language">{resource.language?.name || '-'}</DetailRow>
                <DetailRow label="Copies available">
                  <span className={resource.availableCopies > 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {resource.availableCopies}
                  </span>
                  <span className="text-slate-400"> of {resource.totalCopies}</span>
                </DetailRow>
                <DetailRow label="Shelf (location)">{shelfLocation}</DetailRow>
                <DetailRow label="Times borrowed">{resource.borrowCount || 0}</DetailRow>
              </dl>
            </div>
          </div>

          {resource.description && (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">Description</h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{resource.description}</p>
            </div>
          )}

          {(resource.keywords || []).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {resource.keywords.map((keyword) => <Badge key={keyword} tone="slate">{keyword}</Badge>)}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Acquisition">
            <dl className="divide-y divide-line">
              <DetailRow label="Acquired">{formatDate(resource.acquisitionDate)}</DetailRow>
              <DetailRow label="Source">{humanize(resource.acquisitionSource)}</DetailRow>
              <DetailRow label="Supplier">{resource.supplier || '-'}</DetailRow>
              {/* Prices default to 0 when nobody entered one, so 0 means "not recorded". */}
              <DetailRow label="Purchase price">{resource.purchasePrice > 0 && formatMoney(resource.purchasePrice, symbol)}</DetailRow>
              <DetailRow label="Replacement cost">{resource.replacementCost > 0 && formatMoney(resource.replacementCost, symbol)}</DetailRow>
            </dl>
          </Card>

          {related.length > 0 && (
            <Card title="Related titles" noPadding>
              <ul className="divide-y divide-line">
                {related.map((item) => (
                  <li key={item._id || item.id}>
                    <Link
                      to={`/catalog/${item._id || item.id}`}
                      className="block px-5 py-3 transition-colors hover:bg-slate-50"
                    >
                      <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
                      <p className="text-xs text-slate-500">
                        {/* The API lists reasons strongest first; two is enough to explain the pick. */}
                        {item.relatedBecause?.length > 0 && `${item.relatedBecause.slice(0, 2).join(', ')} · `}
                        {item.availableCopies > 0 ? `${item.availableCopies} available` : 'All copies out'}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Card
        className="mt-4"
        title="Physical copies"
        subtitle={`${resource.totalCopies} total`}
        actions={can(P.COPY_MANAGE) && (
          <Button size="sm" onClick={() => { setEditingCopy(null); setCopyFormOpen(true); }}>
            Add copies
          </Button>
        )}
        noPadding
      >
        <DataTable
          columns={copyColumns}
          rows={resource.copiesList || []}
          emptyTitle="No copies yet"
          emptyDescription="Add at least one physical copy before this title can circulate."
          emptyAction={can(P.COPY_MANAGE)
            ? <Button size="sm" onClick={() => { setEditingCopy(null); setCopyFormOpen(true); }}>Add copies</Button>
            : undefined}
        />
      </Card>

      <CopyForm
        open={copyFormOpen}
        onClose={() => { setCopyFormOpen(false); setEditingCopy(null); }}
        resource={resource}
        copy={editingCopy}
        onSaved={() => { setCopyFormOpen(false); setEditingCopy(null); refetch(); }}
      />

      <ConfirmDialog
        open={Boolean(copyToDelete)}
        onClose={() => setCopyToDelete(null)}
        onConfirm={deleteCopy}
        loading={busy}
        title="Remove this copy?"
        confirmLabel="Remove copy"
        message={`Copy ${copyToDelete?.accessionNumber} will be removed. If it has loan history it is withdrawn instead of deleted, so past transactions stay resolvable.`}
      />

      <Modal
        open={Boolean(labelCopy)}
        onClose={() => setLabelCopy(null)}
        title="Barcode label"
        description={labelCopy?.accessionNumber}
        size="sm"
        footer={<Button onClick={() => window.print()}>Print</Button>}
      >
        <div className="flex flex-col items-center gap-2 rounded-md border border-line p-4">
          <p className="text-center text-xs font-medium text-slate-700">{resource.title}</p>
          <Barcode value={labelCopy?.barcode} />
          <p className="text-2xs text-slate-500">{labelCopy?.accessionNumber}</p>
        </div>
      </Modal>
    </>
  );
}