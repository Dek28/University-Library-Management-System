const ExcelJS = require('exceljs');

/**
 * Builds a formatted .xlsx workbook from plain rows.
 *
 * Columns are declared as `{ header, key, width?, type? }`. Values are written
 * as real dates/numbers (never pre-formatted strings) so the sheet stays
 * sortable and filterable in Excel.
 */
async function buildWorkbook({ title, subtitle, columns, rows, meta = {}, sheetName = 'Report' }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = meta.generatedBy || 'ULMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: meta.headerRows ?? 4 }],
  });

  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width || 20 }));

  const lastCol = columns.length;
  const titleRow = sheet.addRow([title]);
  titleRow.font = { size: 14, bold: true };
  sheet.mergeCells(titleRow.number, 1, titleRow.number, lastCol);

  const subtitleRow = sheet.addRow([subtitle || '']);
  subtitleRow.font = { size: 10, italic: true, color: { argb: 'FF666666' } };
  sheet.mergeCells(subtitleRow.number, 1, subtitleRow.number, lastCol);

  const metaLine = [
    meta.period ? `Period: ${meta.period}` : null,
    `Generated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    meta.generatedBy ? `By: ${meta.generatedBy}` : null,
    `Records: ${rows.length}`,
    // An export that hit the row ceiling says so instead of looking complete.
    meta.truncatedFrom ? `TRUNCATED: showing ${rows.length} of ${meta.truncatedFrom} matching records` : null,
  ].filter(Boolean).join('   |   ');
  const metaRow = sheet.addRow([metaLine]);
  metaRow.font = { size: 9, color: { argb: 'FF888888' } };
  sheet.mergeCells(metaRow.number, 1, metaRow.number, lastCol);

  const headerRow = sheet.addRow(columns.map((c) => c.header));
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });

  rows.forEach((row) => {
    const added = sheet.addRow(columns.map((c) => row[c.key] ?? ''));
    columns.forEach((c, index) => {
      const cell = added.getCell(index + 1);
      if (c.type === 'date' && cell.value) cell.numFmt = 'yyyy-mm-dd';
      if (c.type === 'datetime' && cell.value) cell.numFmt = 'yyyy-mm-dd hh:mm';
      if (c.type === 'money') cell.numFmt = '#,##0.00';
      if (c.type === 'number') cell.numFmt = '#,##0';
    });
  });

  sheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number + rows.length, column: lastCol },
  };

  return workbook;
}

/**
 * Marks a response whose rows were cut short by the export ceiling, so a
 * machine consumer can detect it as easily as a human reading the meta line.
 */
function markTruncated(res, meta = {}) {
  if (meta.truncatedFrom) res.setHeader('X-Export-Truncated', `${meta.total ?? '?'}/${meta.truncatedFrom}`);
}

/** Writes a workbook straight to the HTTP response. */
async function sendWorkbook(res, workbook, filename, meta = {}) {
  markTruncated(res, meta);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

/** Minimal RFC 4180 CSV writer. */
function toCsv(columns, rows) {
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const str = value instanceof Date ? value.toISOString() : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = columns.map((c) => escape(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => escape(row[c.key])).join(',')).join('\n');
  return `${header}\n${body}`;
}

/**
 * CSV carries no meta line — a comment row would break RFC 4180 consumers —
 * so a truncated CSV is flagged with the response header instead.
 */
function sendCsv(res, columns, rows, filename, meta = {}) {
  markTruncated(res, meta);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM keeps Excel happy with UTF-8 content.
  res.send(`﻿${toCsv(columns, rows)}`);
}

module.exports = { buildWorkbook, sendWorkbook, toCsv, sendCsv, markTruncated, ExcelJS };
