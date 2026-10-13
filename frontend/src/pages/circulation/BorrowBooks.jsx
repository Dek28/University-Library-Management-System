import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, BookOpen, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import {
  PageHeader, Card, Button, Input, Textarea, StatusBadge, Badge, Avatar, DetailRow, CameraScanButton,
} from '../../components/ui';
import { loanApi, userApi, copyApi } from '../../api/endpoints';
import { formatDate, formatMoney, fullName, memberIdentifier, humanize, shelfLabel } from '../../utils/format';
import { useAuthStore } from '../../store/auth';
import useFinesEnabled from '../../hooks/useFinesEnabled';

/**
 * Circulation desk: issue an item.
 *
 * The flow mirrors the physical desk: scan the member, scan the item, confirm.
 * Eligibility is checked as soon as the member resolves, so blockers surface
 * before an item is even scanned.
 */
export default function BorrowBooks() {
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const finesEnabled = useFinesEnabled();
  const navigate = useNavigate();

  const [memberInput, setMemberInput] = useState('');
  const [copyInput, setCopyInput] = useState('');
  const [member, setMember] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [copy, setCopy] = useState(null);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null);

  const copyFieldRef = useRef(null);

  // `value` lets a camera scan search immediately, before state has updated.
  const findMember = async (event, value = memberInput) => {
    event?.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    try {
      const found = await userApi.lookup(value.trim());
      setMember(found);
      const check = await loanApi.eligibility({ userId: found.id });
      setEligibility(check);
      // Default the due date from the member's own borrowing policy.
      setDueDate(dayjs().add(check.limits.loanPeriodDays, 'day').format('YYYY-MM-DD'));
      // A physical scanner types and submits, so move focus on for the item.
      setTimeout(() => copyFieldRef.current?.focus(), 50);
    } catch (error) {
      setMember(null);
      setEligibility(null);
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const findCopy = async (event, value = copyInput) => {
    event?.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    try {
      setCopy(await copyApi.lookup(value.trim()));
    } catch (error) {
      setCopy(null);
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const issue = async () => {
    setBusy(true);
    try {
      const loan = await loanApi.issue({
        userIdentifier: memberIdentifier(member),
        copyIdentifier: copy.barcode,
        dueDate: dueDate || undefined,
        notes,
      });
      setIssued(loan);
      toast.success('Item issued successfully');
      // Keep the member loaded so the next item can be scanned straight away.
      setCopy(null);
      setCopyInput('');
      setNotes('');
      const refreshed = await loanApi.eligibility({ userId: member.id });
      setEligibility(refreshed);
      setTimeout(() => copyFieldRef.current?.focus(), 50);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const resetAll = () => {
    setMemberInput(''); setCopyInput(''); setMember(null);
    setEligibility(null); setCopy(null); setNotes(''); setIssued(null);
  };

  const copyIssuable = copy && ['available', 'reserved'].includes(copy.status);
  const canIssue = member && eligibility?.eligible && copyIssuable && !busy;

  return (
    <>
      <PageHeader
        title="Borrow Books"
        breadcrumbs={[{ label: 'Circulation', to: '/circulation' }, { label: 'Borrow' }]}        actions={<Button variant="secondary" onClick={resetAll}>Start over</Button>}
      />

      {/* One column: the numbered steps explain themselves, so there is no side panel. */}
      <div className="max-w-3xl space-y-4">
        {issued && (
          <Card title="Issued successfully">
            <dl className="divide-y divide-line">
              <DetailRow label="Transaction">{issued.transactionId}</DetailRow>
              <DetailRow label="Title">{issued.resource?.title}</DetailRow>
              <DetailRow label="Accession">{issued.copy?.accessionNumber}</DetailRow>
              <DetailRow label="Due">{formatDate(issued.dueDate)}</DetailRow>
            </dl>
            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loanApi.receipt(issued.id).catch((e) => toast.error(e.message))}
              >
                Receipt
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate(`/circulation/loans/${issued.id}`)}>
                Open loan
              </Button>
            </div>
          </Card>
        )}

        <Card title="1. Identify the member">
          <form onSubmit={findMember} className="flex gap-2">
            <Input
              wrapperClassName="flex-1"
              placeholder="Scan card or enter registration / staff number"
              value={memberInput}
              onChange={(e) => setMemberInput(e.target.value)}
              autoFocus
              aria-label="Member identifier"
            />
            <CameraScanButton
              title="Scan the member card"
              className="mt-[26px] h-9 self-start"
              onDetected={(code) => { setMemberInput(code); findMember(null, code); }}
            />
            <Button type="submit" loading={busy && !member} className="mt-[26px] h-9 self-start">Search</Button>
          </form>

          {member && (
            <div className="mt-4 rounded-lg border border-line bg-slate-50/60 p-4">
              <div className="flex items-start gap-3">
                <Avatar user={member} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-md font-semibold text-slate-900">{fullName(member)}</p>
                  <p className="text-xs text-slate-500">{memberIdentifier(member)} · {member.email}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {member.role?.name}{member.department?.name ? ` · ${member.department.name}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StatusBadge status={member.status} />
                    {eligibility && (
                      <>
                        <Badge tone="slate">{eligibility.limits.activeLoans}/{eligibility.limits.maxBooks} on loan</Badge>
                        {eligibility.limits.overdueLoans > 0 && <Badge tone="red">{eligibility.limits.overdueLoans} overdue</Badge>}
                        {finesEnabled && eligibility.limits.outstandingFines > 0 && (
                          <Badge tone="amber">{formatMoney(eligibility.limits.outstandingFines, symbol)} owing</Badge>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {eligibility && (
                <div className={`mt-3 flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 ${
                  eligibility.eligible ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
                }`}
                >
                  {eligibility.eligible
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />}
                  <div className="text-sm">
                    {eligibility.eligible ? (
                      <p className="text-emerald-800">
                        Eligible to borrow. {eligibility.limits.remaining} of {eligibility.limits.maxBooks} slot(s) remaining.
                      </p>
                    ) : (
                      <>
                        <p className="font-medium text-red-800">This member cannot borrow right now:</p>
                        <ul className="mt-1 list-inside list-disc text-red-700">
                          {eligibility.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="2. Scan the item">
          <form onSubmit={findCopy} className="flex gap-2">
            <Input
              ref={copyFieldRef}
              wrapperClassName="flex-1"
              placeholder="Scan or enter book barcode / accession number"
              value={copyInput}
              onChange={(e) => setCopyInput(e.target.value)}
              aria-label="Copy barcode"
            />
            <CameraScanButton
              title="Scan the book"
              className="mt-[26px] h-9 self-start"
              onDetected={(code) => { setCopyInput(code); findCopy(null, code); }}
            />
            <Button type="submit" loading={busy && Boolean(member) && !copy} className="mt-[26px] h-9 self-start">Search</Button>
          </form>

          {copy && (
            <div className="mt-4 flex gap-4 rounded-lg border border-line bg-slate-50/60 p-4">
              <div className="flex h-24 w-18 min-w-[64px] items-center justify-center rounded-lg bg-raised ring-1 ring-line">
                <BookOpen className="h-7 w-7 text-slate-300" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-slate-900">{copy.resource?.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {copy.resource?.isbn ? `ISBN ${copy.resource.isbn} · ` : ''}{copy.accessionNumber}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Barcode {copy.barcode} · {shelfLabel(copy.shelf, 'Unshelved')} · condition {humanize(copy.condition)}
                </p>
                <div className="mt-2">
                  <StatusBadge status={copy.status} />
                </div>
                {copy.status === 'reserved' && (
                  <p className="mt-2 text-xs text-slate-600">
                    Held on reservation: it can only be issued to the member it is held for.
                  </p>
                )}
                {!copyIssuable && (
                  <p className="mt-2 text-xs font-medium text-red-600">
                    This copy is not issuable while its status is “{humanize(copy.status)}”.
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card title="3. Confirm the loan">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Borrow date"
              type="date"
              value={dayjs().format('YYYY-MM-DD')}
              readOnly
              disabled
            />
            <Input
              label="Due date"
              type="date"
              value={dueDate}
              min={dayjs().add(1, 'day').format('YYYY-MM-DD')}
              onChange={(e) => setDueDate(e.target.value)}
              hint={eligibility ? `Default for this member's role: ${eligibility.limits.loanPeriodDays} days` : undefined}
            />
          </div>
          <div className="mt-4">
            <Textarea label="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={resetAll}>Cancel</Button>
            <Button onClick={issue} disabled={!canIssue} loading={busy && canIssue}>Borrow Book</Button>
          </div>
        </Card>
      </div>
    </>
  );
}
