import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, X, ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  PageHeader, Card, Button, Select, Checkbox, DataTable, Badge, Spinner,
} from '../../components/ui';
import { resourceApi } from '../../api/endpoints';
import { formatBytes, formatNumber } from '../../utils/format';

/** Groups the field picker the same way the Add Book form is laid out. */
const FORM_SECTIONS = [
  {
    label: 'Bibliographic details',
    keys: ['title', 'subtitle', 'resourceType', 'category', 'isbn', 'publisher', 'publicationYear', 'edition', 'language', 'volume', 'pages', 'shelf', 'shelfSection', 'shelfRack'],
  },
  { label: 'Classification and discovery', keys: ['authors', 'subjects', 'faculty', 'department', 'keywords', 'description'] },
  {
    label: 'Acquisition and circulation rules',
    keys: ['acquisitionSource', 'supplier', 'purchasePrice', 'replacementCost', 'isBorrowable', 'isReferenceOnly'],
  },
  { label: 'Stock', keys: ['copies'] },
];

function DropZone({ onPick, busy }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); onPick(e.dataTransfer.files?.[0]); }}
      className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        dragging ? 'border-brand-400 bg-brand-50' : 'border-slate-300 bg-slate-50'
      }`}
    >
      {busy ? (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
          <Spinner /> Reading the spreadsheet…
        </div>
      ) : (
        <>
          <UploadCloud className="mx-auto mb-2 h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="text-sm text-slate-600">
            Drag your spreadsheet here, or{' '}
            <label className="cursor-pointer font-medium text-brand-600 hover:underline">
              browse
              <input
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }}
              />
            </label>
          </p>
          <p className="mt-1 text-xs text-slate-500">Excel (.xlsx) or CSV, up to 2,000 books. The first row must hold the column headings.</p>
        </>
      )}
    </div>
  );
}

/**
 * Bulk catalogue import.
 *
 * The file is read first so each spreadsheet column can be matched to a field
 * of the Add Book form (headings are matched automatically and can be changed),
 * then validated, then imported. Rows with problems are reported and skipped.
 */
export default function CatalogImport() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [mapping, setMapping] = useState({});
  const [createMissing, setCreateMissing] = useState(false);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(null); // 'validate' | 'import'
  const [result, setResult] = useState(null);

  const fields = useMemo(() => inspection?.fields || [], [inspection]);
  const fieldByKey = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, f])), [fields]);
  const mappedKeys = new Set(Object.values(mapping).filter(Boolean));

  const reset = () => {
    setFile(null);
    setInspection(null);
    setMapping({});
    setResult(null);
  };

  const pick = async (selected) => {
    if (!selected) return;
    if (/\.xls$/i.test(selected.name)) {
      toast.error('Old .xls files cannot be read. Save the file as .xlsx or .csv in Excel and try again.');
      return;
    }
    if (!/\.(xlsx|csv)$/i.test(selected.name)) {
      toast.error('Choose an .xlsx or .csv file');
      return;
    }
    setReading(true);
    setResult(null);
    try {
      const data = await resourceApi.inspectImport(selected);
      setFile(selected);
      setInspection(data);
      setMapping(data.mapping || {});
      if (data.totalRows > data.maxRows) toast.error(`This file has ${formatNumber(data.totalRows)} rows; the limit is ${formatNumber(data.maxRows)}. Split it into smaller files.`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setReading(false);
    }
  };

  /** One field per column: choosing a field already in use frees it from the other column. */
  const assign = (column, key) => {
    setResult(null);
    setMapping((current) => {
      const next = { ...current };
      if (key) {
        Object.keys(next).forEach((col) => { if (next[col] === key) delete next[col]; });
        next[column] = key;
      } else {
        delete next[column];
      }
      return next;
    });
  };

  const run = async (dryRun) => {
    setRunning(dryRun ? 'validate' : 'import');
    try {
      const response = await resourceApi.import(file, { mapping, dryRun, createMissing });
      setResult({ ...response, dryRun });
      if (dryRun) {
        toast.success(`${response.imported} of ${response.total} book(s) are ready to import`);
      } else {
        toast.success(`Imported ${response.imported} book(s)${response.copiesCreated ? ` and ${response.copiesCreated} copies` : ''}`);
        queryClient.invalidateQueries({ queryKey: ['resources'] });
        queryClient.invalidateQueries({ queryKey: ['catalog'] });
        queryClient.invalidateQueries({ queryKey: ['reference'] });
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRunning(null);
    }
  };

  const fieldOptions = (
    <>
      <option value="">Do not import</option>
      {FORM_SECTIONS.map((section) => (
        <optgroup key={section.label} label={section.label}>
          {section.keys.filter((key) => fieldByKey[key]).map((key) => (
            <option key={key} value={key}>
              {fieldByKey[key].label}{fieldByKey[key].required ? ' (required)' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );

  const unmappedFormFields = fields.filter((f) => !mappedKeys.has(f.key) && !['shelfSection', 'shelfRack'].includes(f.key));
  const titleMapped = mappedKeys.has('title');
  const importedColumns = Object.keys(mapping).length;

  const errorColumns = [
    { key: 'row', header: 'Row', align: 'center', primary: true },
    { key: 'identifier', header: 'Book' },
    {
      key: 'problems',
      header: 'What to fix',
      render: (row) => (
        <ul className="list-inside list-disc text-xs text-red-600">
          {row.problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
      ),
    },
  ];

  const newRefs = result?.newReferences || {};
  const newRefLines = [
    ['categories', 'category', 'categories'], ['languages', 'language', 'languages'],
    ['subjects', 'subject', 'subjects'], ['publishers', 'publisher', 'publishers'],
  ].filter(([key]) => newRefs[key]?.length).map(([key, one, many]) => {
    const names = newRefs[key];
    return `${names.length} ${names.length === 1 ? one : many} (${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''})`;
  });

  return (
    <>
      <PageHeader
        title="Bulk import books"
        breadcrumbs={[{ label: 'Catalog', to: '/catalog' }, { label: 'Bulk import' }]}
        actions={<Button as={Link} to="/catalog" variant="secondary">Back to catalog</Button>}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* Step 1 */}
          <Card title="1. Upload the spreadsheet">
            {file ? (
              <div className="flex items-center gap-3 rounded-lg border border-line bg-slate-50 px-4 py-3">
                <FileSpreadsheet className="h-8 w-8 shrink-0 text-emerald-600" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(file.size)} · {formatNumber(inspection.totalRows)} book row(s) · {inspection.columns.length} column(s)
                  </p>
                </div>
                <button type="button" onClick={reset} className="rounded p-1 text-slate-400 hover:bg-slate-200" aria-label="Choose another file">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <DropZone onPick={pick} busy={reading} />
            )}
          </Card>

          {/* Step 2 */}
          {inspection && (
            <Card
              title="2. Match columns to the catalogue form"
              subtitle="Headings were matched automatically. Check each one and change any that are wrong."
              noPadding
            >
              <div className="divide-y divide-line">
                {inspection.columns.map((col) => {
                  const key = mapping[col.column] || '';
                  return (
                    <div key={col.column} className="grid items-center gap-3 px-5 py-3 sm:grid-cols-[1fr_auto_1fr]">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{col.header}</p>
                        <p className="truncate text-xs text-slate-500">
                          {col.samples.length ? `e.g. ${col.samples.join(' · ')}` : 'Empty column'}
                        </p>
                      </div>
                      <ArrowRight className="hidden h-4 w-4 text-slate-400 sm:block" aria-hidden="true" />
                      <div className="flex items-center gap-2">
                        <Select
                          aria-label={`Form field for column ${col.header}`}
                          wrapperClassName="flex-1"
                          value={key}
                          onChange={(e) => assign(col.column, e.target.value)}
                          className={key ? '' : 'text-slate-400'}
                        >
                          {fieldOptions}
                        </Select>
                        {key && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Matched" />}
                      </div>
                      {key && fieldByKey[key]?.hint && (
                        <p className="text-xs text-slate-500 sm:col-start-3">{fieldByKey[key].hint}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 border-t border-line px-5 py-3.5 text-sm">
                {!titleMapped && (
                  <p className="flex items-center gap-2 text-red-600">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    Match one column to Title. Every book needs a title.
                  </p>
                )}
                <p className="text-slate-600">
                  {importedColumns} of {inspection.columns.length} column(s) will be imported.
                </p>
                {unmappedFormFields.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-slate-500">Form fields left at their defaults:</span>
                    {unmappedFormFields.map((f) => <Badge key={f.key}>{f.label}</Badge>)}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Step 3 */}
          {inspection && (
            <Card title="3. Validate and import">
              <Checkbox
                label="Create missing categories, languages and subjects"
                checked={createMissing}
                onChange={(e) => { setCreateMissing(e.target.checked); setResult(null); }}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => run(true)} loading={running === 'validate'} disabled={!titleMapped || Boolean(running)}>
                  Validate only
                </Button>
                <Button onClick={() => run(false)} loading={running === 'import'} disabled={!titleMapped || Boolean(running)}>
                  Import {formatNumber(result?.dryRun ? result.imported : inspection.totalRows)} book(s)
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Validating checks every row without saving anything. When importing, rows with problems are skipped and the rest are saved.
              </p>
            </Card>
          )}

          {/* Result */}
          {result && (
            <Card title={result.dryRun ? 'Validation result' : 'Import result'}>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-line px-4 py-3">
                  <p className="text-xs text-slate-500">Rows in file</p>
                  <p className="text-xl font-semibold text-slate-900">{formatNumber(result.total)}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-xs text-emerald-700">{result.dryRun ? 'Ready to import' : 'Books created'}</p>
                  <p className="text-xl font-semibold text-emerald-700">{formatNumber(result.imported)}</p>
                </div>
                <div className="rounded-lg border border-line px-4 py-3">
                  <p className="text-xs text-slate-500">{result.dryRun ? 'Copies to create' : 'Copies created'}</p>
                  <p className="text-xl font-semibold text-slate-900">{formatNumber(result.copiesCreated)}</p>
                </div>
                <div className={`rounded-lg border px-4 py-3 ${result.skipped ? 'border-red-200 bg-red-50' : 'border-line'}`}>
                  <p className={`text-xs ${result.skipped ? 'text-red-700' : 'text-slate-500'}`}>{result.dryRun ? 'Need fixing' : 'Skipped'}</p>
                  <p className={`text-xl font-semibold ${result.skipped ? 'text-red-700' : 'text-slate-900'}`}>{formatNumber(result.skipped)}</p>
                </div>
              </div>

              {newRefLines.length > 0 && (
                <p className="mt-4 text-sm text-slate-600">
                  {result.dryRun ? 'Will also add' : 'Also added'} to Reference data: {newRefLines.join('; ')}.
                </p>
              )}

              {result.errors.length > 0 ? (
                <div className="mt-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    {result.dryRun
                      ? 'Fix these rows in the spreadsheet and upload it again, or import now and they will be skipped'
                      : 'These rows were skipped. Fix them and import a file with just those rows.'}
                  </p>
                  <div className="rounded-md border border-line">
                    <DataTable columns={errorColumns} rows={result.errors} rowKey={(row) => row.row} />
                  </div>
                </div>
              ) : (
                <p className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {result.dryRun ? 'Every row passed validation.' : 'Every row was imported.'}
                </p>
              )}

              {!result.dryRun && result.created?.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold text-slate-800">Books added</p>
                  <ul className="space-y-1 text-sm">
                    {result.created.slice(0, 10).map((book) => (
                      <li key={book.id}>
                        <Link to={`/catalog/${book.id}`} className="text-brand-600 hover:underline">{book.title}</Link>
                      </li>
                    ))}
                  </ul>
                  {result.created.length > 10 && (
                    <p className="mt-1 text-xs text-slate-500">and {formatNumber(result.created.length - 10)} more.</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Button as={Link} to="/catalog" size="sm">View catalog</Button>
                    <Button size="sm" variant="secondary" onClick={reset}>Import another file</Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Help */}
        <div className="space-y-4">
          <Card title="Use the template (optional)">
            <p className="text-sm text-slate-600">
              The template has one column per Add Book field, headed with the form's own labels, and drop-down lists
              filled from your categories, languages and shelves.
            </p>
            <Button
              variant="secondary"
              className="mt-3"
              onClick={() => resourceApi.downloadImportTemplate().catch((e) => toast.error(e.message))}
            >
              Download template
            </Button>
            <p className="mt-3 text-xs text-slate-500">
              Your own spreadsheet works too. Headings such as "Author", "Year Published", "Shelf Location" or "Qty"
              are recognised, and you can match any column by hand in step 2.
            </p>
          </Card>

          <Card title="How values are read">
            <ul className="space-y-2 text-xs text-slate-600">
              <li><strong className="text-slate-800">Authors, Subjects, Keywords:</strong> separate several with a semicolon (;).</li>
              <li><strong className="text-slate-800">Category, Language, Shelf, Faculty, Department:</strong> must match a name in Reference data. Capital letters don't matter.</li>
              <li><strong className="text-slate-800">Edition:</strong> 3, 3rd or Third are all saved as "3rd Edition".</li>
              <li><strong className="text-slate-800">Prices:</strong> currency symbols and commas are ignored.</li>
              <li><strong className="text-slate-800">Available for loan, Reference only:</strong> Yes or No.</li>
              <li><strong className="text-slate-800">Number of copies:</strong> creates that many copies with barcodes, placed on the book's shelf.</li>
              <li><strong className="text-slate-800">ISBN:</strong> a book whose ISBN is already in the catalogue is skipped, so importing the same file twice doesn't duplicate books that have an ISBN.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
