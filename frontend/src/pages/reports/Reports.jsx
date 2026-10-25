import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { BarChart3, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import {
  PageHeader, Card, StatCard, Button, Select, Input, DataTable, Spinner, EmptyState,
} from '../../components/ui';
import { reportApi } from '../../api/endpoints';
import { useAuthStore } from '../../store/auth';
import useFinesEnabled from '../../hooks/useFinesEnabled';
import { DailyBarChart, RankingBarChart } from '../../components/charts/Charts';
import { formatMoney, formatNumber } from '../../utils/format';

const GROUP_LABELS = {
  circulation: 'Circulation',
  resources: 'Resources',
  users: 'Users',
  fines: 'Finance',
  clearance: 'Clearance',
  'reading-groups': 'Reading groups',
};

export default function Reports() {
  const settings = useAuthStore((state) => state.settings);
  const symbol = settings?.locale?.currencySymbol || '$';
  const finesEnabled = useFinesEnabled();

  const [reportKey, setReportKey] = useState('circulation-issued');
  const [from, setFrom] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [criteria, setCriteria] = useState(null);
  const [exporting, setExporting] = useState(null);

  const { data: catalogue = [] } = useQuery({
    queryKey: ['reports', 'catalogue'],
    queryFn: reportApi.list,
    staleTime: 10 * 60_000,
  });

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['reports', 'overview', from, to],
    queryFn: () => reportApi.overview({ from, to }),
    staleTime: 60_000,
  });

  const { data: report, isFetching } = useQuery({
    queryKey: ['reports', 'run', criteria],
    queryFn: () => reportApi.run(criteria.key, { from: criteria.from, to: criteria.to }),
    enabled: Boolean(criteria),
    placeholderData: keepPreviousData,
  });

  const grouped = catalogue.reduce((acc, entry) => {
    (acc[entry.group] = acc[entry.group] || []).push(entry);
    return acc;
  }, {});

  const generate = () => setCriteria({ key: reportKey, from, to });

  const exportAs = async (format) => {
    setExporting(format);
    try {
      await reportApi.export(reportKey, { from, to }, format);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setExporting(null);
    }
  };

  // The report's own column definitions drive the table, so a new backend
  // report appears here with no frontend change.
  const columns = (report?.columns || []).map((column) => ({
    key: column.key,
    header: column.header,
    align: column.align,
    primary: column.key === report.columns[0].key,
    render: (row) => {
      const value = row[column.key];
      if (value === null || value === undefined || value === '') return '-';
      if (column.type === 'money') return formatMoney(value, symbol);
      return String(value);
    },
  }));

  const dailyIssues = overview?.circulationTrend?.map((entry) => ({
    date: entry.label,
    issued: entry.issued,
    returned: entry.returned,
  })) || [];

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        breadcrumbs={[{ label: 'Reports' }]}
      />

      <Card className="mb-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Select Report Type"
            value={reportKey}
            onChange={(e) => setReportKey(e.target.value)}
            wrapperClassName="lg:col-span-2"
          >
            {Object.entries(grouped).map(([group, entries]) => (
              <optgroup key={group} label={GROUP_LABELS[group] || group}>
                {entries.map((entry) => <option key={entry.key} value={entry.key}>{entry.title}</option>)}
              </optgroup>
            ))}
          </Select>
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={generate} loading={isFetching && Boolean(criteria)}>Generate Report</Button>
          <Button variant="secondary" onClick={() => exportAs('pdf')} loading={exporting === 'pdf'}>Export PDF</Button>
          <Button variant="secondary" onClick={() => exportAs('xlsx')} loading={exporting === 'xlsx'}>Export Excel</Button>
          <Button variant="ghost" onClick={() => exportAs('csv')} loading={exporting === 'csv'}>Export CSV</Button>
        </div>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {finesEnabled ? (
          <>
            <StatCard
              label="Fines charged"
              value={formatMoney(overview?.fines?.totalCharged, symbol)}
              tone="blue"
              loading={overviewLoading}
            />
            <StatCard
              label="Fines collected"
              value={formatMoney(overview?.fines?.totalPaid, symbol)}
              tone="green"
              loading={overviewLoading}
            />
            <StatCard
              label="Still outstanding"
              value={formatMoney(overview?.fines?.totalOutstanding, symbol)}
              tone="red"
              loading={overviewLoading}
            />
          </>
        ) : (
          // Without fines, the same row shows stock instead.
          <>
            <StatCard label="Total copies" value={formatNumber(overview?.stock?.total)} tone="blue" loading={overviewLoading} />
            <StatCard label="On loan" value={formatNumber(overview?.stock?.byStatus?.borrowed)} tone="amber" loading={overviewLoading} />
            <StatCard label="Available" value={formatNumber(overview?.stock?.byStatus?.available)} tone="green" loading={overviewLoading} />
          </>
        )}
        <StatCard
          label="Active reading groups"
          value={formatNumber(overview?.readingGroups?.activeGroups)}
          tone="purple"
          loading={overviewLoading}
        />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card title="Monthly circulation" className="xl:col-span-2">
          {overviewLoading
            ? <div className="skeleton h-[280px]" />
            : <DailyBarChart data={dailyIssues} xKey="date" bars={[{ key: 'issued', name: 'Borrowed' }, { key: 'returned', name: 'Returned' }]} />}
        </Card>

        <Card title="Most used study spaces">
          {overviewLoading
            ? <div className="skeleton h-[280px]" />
            : <RankingBarChart data={overview?.readingGroups?.mostUsedSpaces || []} nameKey="space" valueKey="sessions" />}
        </Card>
      </div>

      <Card
        title={report?.title || 'Report results'}
        subtitle={criteria ? `${from} to ${to}` : 'Choose a report and select Generate Report'}
        noPadding
      >
        {!criteria ? (
          <EmptyState
            icon={BarChart3}
            title="No report generated yet"
            description="Pick a report type and date range above, then choose Generate Report."
          />
        ) : isFetching && !report ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <>
            <div className="border-b border-line px-5 py-2.5">
              <p className="text-xs text-slate-500">
                {formatNumber(report?.rows?.length || 0)} row(s). Exports use exactly these rows and filters.
              </p>
            </div>
            <DataTable
              columns={columns}
              rows={report?.rows || []}
              rowKey={(row, index) => `${row[columns[0]?.key]}-${index}`}
              emptyTitle="No rows matched"
              emptyDescription="Widen the date range or choose a different report."
            />
          </>
        )}
      </Card>
    </>
  );
}
