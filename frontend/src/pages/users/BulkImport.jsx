import { useState } from 'react';
import { Link } from 'react-router';
import { Download, UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import {
  PageHeader,
  Card,
  Button,
  PasswordInput,
  Select,
  Checkbox,
  DataTable,
} from '../../components/ui';
import { userApi, adminApi } from '../../api/endpoints';
import { formatBytes } from '../../utils/format';

/**
 * Bulk student import.
 *
 * A dry run validates the whole file without writing anything, so a bad
 * spreadsheet can be corrected before any account is created.
 */
export default function BulkImport() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [password, setPassword] = useState('');
  const [roleKey, setRoleKey] = useState('student');
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: adminApi.roles, staleTime: 10 * 60_000 });

  const pick = (selected) => {
    if (!selected) return;
    if (!/\.(xlsx|xls|csv)$/i.test(selected.name)) {
      toast.error('Choose an .xlsx, .xls or .csv file');
      return;
    }
    setFile(selected);
    setResult(null);
  };

  const download = async () => {
    try {
      await userApi.downloadTemplate();
      toast.success('Template downloaded');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      const response = await userApi.import(file, { defaultPassword: password, roleKey, dryRun });
      setResult({ ...response, dryRun });
      if (dryRun) {
        toast.success(`Validation finished: ${response.imported} row(s) would be created`);
      } else {
        toast.success(`Imported ${response.imported} member(s)`);
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const errorColumns = [
    { key: 'row', header: 'Row', align: 'center', primary: true },
    { key: 'identifier', header: 'Identifier' },
    {
      key: 'problems',
      header: 'Problems',
      render: (row) => (
        <ul className="list-inside list-disc text-xs text-red-600">
          {row.problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Bulk import"
        breadcrumbs={[{ label: 'Users', to: '/users' }, { label: 'Bulk import' }]}
        actions={<Button as={Link} to="/users" variant="secondary">Back to users</Button>}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="1. Prepare the spreadsheet">
            <p className="text-sm text-slate-600">
              Download the template, fill in one row per student, and keep the header row unchanged.
              Faculty, department and program codes must match the reference data already configured.
            </p>
            <Button variant="secondary" className="mt-3" onClick={download}>
              Download template
            </Button>
          </Card>

          <Card title="2. Upload the file">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
              className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                dragging ? 'border-brand-400 bg-brand-50' : 'border-slate-300 bg-slate-50'
              }`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-emerald-600" aria-hidden="true" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-800">{file.name}</p>
                    <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                  </div>
                  <button type="button" onClick={() => { setFile(null); setResult(null); }} className="rounded p-1 text-slate-400 hover:bg-slate-200" aria-label="Remove file">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <UploadCloud className="mx-auto mb-2 h-8 w-8 text-slate-400" aria-hidden="true" />
                  <p className="text-sm text-slate-600">
                    Drag the spreadsheet here, or{' '}
                    <label className="cursor-pointer font-medium text-brand-600 hover:underline">
                      browse
                      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                    </label>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">XLSX, XLS or CSV, up to 5000 rows</p>
                </>
              )}
            </div>
          </Card>

          <Card title="3. Set the defaults and run">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Role for imported accounts"
                options={(roles || []).filter((r) => ['student', 'lecturer'].includes(r.key)).map((r) => ({ value: r.key, label: r.name }))}
                value={roleKey}
                onChange={(e) => setRoleKey(e.target.value)}
              />
              <PasswordInput
                label="Default password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                hint="Every imported member must change this at first sign-in."
              />
            </div>

            <div className="mt-4">
              <Checkbox
                label="Validate only (dry run)"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
              />
            </div>

            <Button
              className="mt-4"
              onClick={run}
              loading={busy}
              disabled={!file || password.length < 8}
            >
              {dryRun ? 'Validate file' : 'Import members'}
            </Button>
          </Card>

          {result && (
            <Card
              title={result.dryRun ? 'Validation result' : 'Import result'}
              actions={result.dryRun && result.errors.length === 0 && (
                <Button size="sm" onClick={() => { setDryRun(false); }}>Ready: switch off dry run</Button>
              )}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-line px-4 py-3">
                  <p className="text-xs text-slate-500">Rows in file</p>
                  <p className="text-xl font-semibold text-slate-900">{result.total}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-xs text-emerald-700">{result.dryRun ? 'Would be created' : 'Created'}</p>
                  <p className="text-xl font-semibold text-emerald-700">{result.imported}</p>
                </div>
                <div className={`rounded-lg border px-4 py-3 ${result.skipped ? 'border-red-200 bg-red-50' : 'border-line'}`}>
                  <p className={`text-xs ${result.skipped ? 'text-red-700' : 'text-slate-500'}`}>Skipped</p>
                  <p className={`text-xl font-semibold ${result.skipped ? 'text-red-700' : 'text-slate-900'}`}>{result.skipped}</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    Rows that need attention
                  </p>
                  <div className="rounded-md border border-line">
                    <DataTable
                      columns={errorColumns}
                      rows={result.errors}
                      rowKey={(row) => row.row}
                      emptyTitle="No problems"
                    />
                  </div>
                </div>
              )}

              {result.errors.length === 0 && (
                <p className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Every row passed validation.
                </p>
              )}
            </Card>
          )}
        </div>

        <Card title="Column reference">
          <ul className="space-y-2 text-sm text-slate-600">
            {[
              ['registrationNumber', 'required'],
              ['firstName', 'required'],
              ['middleName', 'optional'],
              ['lastName', 'required'],
              ['email', 'required, unique'],
              ['phone', 'optional'],
              ['gender', 'male / female / other / undisclosed'],
              ['facultyCode', 'must match a faculty code'],
              ['departmentCode', 'must match a department code'],
              ['programCode', 'must match a program code'],
              ['academicYear', 'e.g. 2026/2027'],
              ['yearOfStudy', 'number'],
              ['semester', 'number'],
            ].map(([column, note]) => (
              <li key={column} className="flex items-start justify-between gap-3 border-b border-line pb-2 last:border-0">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">{column}</code>
                <span className="text-right text-xs text-slate-500">{note}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            A row with an email or registration number that already exists is reported and skipped.
            The rest of the file is still imported.
          </p>
        </Card>
      </div>
    </>
  );
}
