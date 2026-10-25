const { toCsv, buildWorkbook } = require('../../src/reports/excel');

describe('Spreadsheet export safety', () => {
  const columns = [
    { header: 'Name', key: 'name' },
    { header: 'Balance', key: 'balance' },
  ];

  it('keeps typed text that looks like a formula from running in CSV', () => {
    const csv = toCsv(columns, [
      { name: '=HYPERLINK("http://evil.test","click")', balance: -5 },
      { name: '+1+1', balance: 0 },
      { name: '@SUM(A1)', balance: 1 },
      { name: 'Ordinary Name', balance: 2 },
    ]);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('"\'=HYPERLINK(""http://evil.test"",""click"")",-5');
    expect(lines[2]).toBe("'+1+1,0");
    expect(lines[3]).toBe("'@SUM(A1),1");
    expect(lines[4]).toBe('Ordinary Name,2');
  });

  it('quotes values that contain a carriage return', () => {
    expect(toCsv(columns, [{ name: 'a\rb', balance: 1 }])).toContain('"a\rb"');
  });

  it('writes formula-like text into Excel as plain text and keeps numbers numeric', async () => {
    const workbook = await buildWorkbook({
      title: 'T', columns, rows: [{ name: '=1+1', balance: -5 }],
    });
    const row = workbook.worksheets[0].lastRow;
    expect(row.getCell(1).value).toBe("'=1+1");
    expect(row.getCell(2).value).toBe(-5);
  });
});
