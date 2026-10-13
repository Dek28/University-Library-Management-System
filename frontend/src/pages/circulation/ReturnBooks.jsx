import { useState } from 'react';
import { Search, BookOpen, AlertTriangle, CheckCircle2, Bookmark } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, Button, Input, Select, Textarea, StatusBadge, Badge, Avatar, DetailRow, CameraScanButton,
} from '../../components/ui';
import { loanApi, copyApi } from '../../api/endpoints';
import { COPY_CONDITIONS } from '../../constants';
import { formatDate, formatMoney, fullName, memberIdentifier, daysUntil } from '../../utils/format';
import { useAuthStore } from '../../store/auth';
import useFinesEnabled from '../../hooks/useFinesEnabled';

/**
 * Circulation desk: receive a return.
 *
 * Scanning resolves the open loan for that copy; the librarian then records
 * the condition, and the API decides the fines and where the copy goes next.
 */
export default function ReturnBooks() {
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const finesEnabled = useFinesEnabled();

  const [scan, setScan] = useState('');
  const [copy, setCopy] = useState(null);
  const [loan, setLoan] = useState(null);
  const [condition, setCondition] = useState('good');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  // `value` lets a camera scan search immediately, before state has updated.
  const find = async (event, value = scan) => {
    event?.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const found = await copyApi.lookup(value.trim());
      setCopy(found);

      // Resolve the open loan so the desk can see who is returning what.
      const { items } = await loanApi.list({ copy: found.id, openOnly: true, limit: 1 });
      if (!items.length) {
        setLoan(null);
        toast.error(`No open loan found for ${found.accessionNumber}`);
      } else {
        setLoan(items[0]);
        setCondition('good');
      }
    } catch (error) {
      setCopy(null);
      setLoan(null);
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const submitReturn = async () => {
    setBusy(true);
    try {
      const response = await loanApi.return({ copyIdentifier: copy.barcode, condition, notes });
      setResult(response);
      setLoan(null);
      setCopy(null);
      setScan('');
      setNotes('');
      toast.success(response.fines?.length ? `Return recorded. ${response.fines.length} fine(s) raised.` : (finesEnabled ? 'Return recorded, no fines due' : 'Return recorded'));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const overdueDays = loan ? Math.max(0, -daysUntil(loan.dueDate)) : 0;

  return (
    <>
      <PageHeader
        title="Return Books"
        breadcrumbs={[{ label: 'Circulation', to: '/circulation' }, { label: 'Return' }]}      />

      <div className="max-w-3xl space-y-4">
        <Card title="Scan the item">
          <form onSubmit={find} className="flex gap-2">
            <Input
              wrapperClassName="flex-1"
              placeholder="Scan or enter book barcode / accession number"
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              autoFocus
              aria-label="Copy barcode"
            />
            <CameraScanButton
              title="Scan the book"
              className="mt-[26px] h-9 self-start"
              onDetected={(code) => { setScan(code); find(null, code); }}
            />
            <Button type="submit" loading={busy && !loan} className="mt-[26px] h-9 self-start">Search</Button>
          </form>
        </Card>

        {loan && (
          <>
            {loan.user && (
              <Card title="Borrower">
                <div className="flex items-start gap-3">
                  <Avatar user={loan.user} size="lg" />
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900">{fullName(loan.user)}</p>
                    <p className="text-xs text-slate-500">{memberIdentifier(loan.user)}</p>
                    <p className="truncate text-xs text-slate-500">{loan.user.email}</p>
                  </div>
                </div>
              </Card>
            )}

            <Card title="Book details">
              <div className="flex gap-4">
                <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded bg-slate-100 ring-1 ring-line">
                  <BookOpen className="h-6 w-6 text-slate-300" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-slate-900">{loan.resource?.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{copy?.accessionNumber} · {copy?.barcode}</p>
                  <dl className="mt-2 divide-y divide-line">
                    <DetailRow label="Borrowed on">{formatDate(loan.borrowDate)}</DetailRow>
                    <DetailRow label="Due date">
                      <span className="flex items-center gap-2">
                        {formatDate(loan.dueDate)}
                        {overdueDays > 0
                          ? <Badge tone="red">{overdueDays} day(s) overdue</Badge>
                          : <Badge tone="green">On time</Badge>}
                      </span>
                    </DetailRow>
                    <DetailRow label="Renewals">{loan.renewalCount} of {loan.maxRenewals}</DetailRow>
                  </dl>
                </div>
              </div>
            </Card>

            <Card title="Record the return">
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Condition on return"
                  options={COPY_CONDITIONS}
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  hint={finesEnabled ? 'Damaged and lost conditions raise a charge automatically.' : undefined}
                />
                <Input label="Return date" type="date" value={new Date().toISOString().slice(0, 10)} disabled />
              </div>

              {['damaged', 'severely_damaged', 'lost'].includes(condition) && (
                <div className="mt-3 flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  <p className="text-sm text-amber-800">
                    Recording this condition {finesEnabled && 'raises a charge against the member and '}takes the copy out of circulation.
                  </p>
                </div>
              )}

              <div className="mt-4">
                <Textarea label="Remarks (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Enter remarks" />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => { setLoan(null); setCopy(null); setScan(''); }}>Cancel</Button>
                <Button onClick={submitReturn} loading={busy}>Return Book</Button>
              </div>
            </Card>
          </>
        )}

        {result && (
          <Card title="Return completed">
            <div className="flex items-start gap-2.5 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <div className="text-sm text-emerald-800">
                <p className="font-medium">Loan {result.loan?.transactionId} closed as “{result.loan?.status}”.</p>
                <p className="mt-0.5">The copy is now marked “{result.copyStatus}”.</p>
              </div>
            </div>

            {result.fines?.length > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-sm font-semibold text-slate-800">Charges raised</p>
                <ul className="divide-y divide-line rounded-md border border-line">
                  {result.fines.map((fine) => (
                    <li key={fine.id || fine._id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{fine.fineCode}</p>
                        <p className="truncate text-xs text-slate-500">{fine.reason}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-red-600">{formatMoney(fine.amount, symbol)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.reservationPromoted && (
              <div className="mt-3 flex items-start gap-2.5 rounded-md border border-brand-200 bg-brand-50 px-3.5 py-2.5">
                <Bookmark className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                <p className="text-sm text-brand-800">
                  This copy was allocated to the next member in the reservation queue, and they have been notified to collect it.
                </p>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loanApi.receipt(result.loan.id).catch((e) => toast.error(e.message))}
              >
                Print receipt
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setResult(null)}>Dismiss</Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
