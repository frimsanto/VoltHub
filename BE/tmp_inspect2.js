const ExcelJS = require('exceljs');
const path = require('path');
const dir = 'D:/VoltReport/dataset_scada';
const files = ['Laporan Gardu RC Aktif.xlsx','Laporan GH Aktif.xlsx','Laporan GI Aktif.xlsx'];
(async () => {
  for (const f of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(dir, f));
    const ws = wb.worksheets[0];
    console.log('\n===== FILE:', f, '=====');
    // sample data rows (4..8), first 8 columns + a few daily cols
    for (let r = 4; r <= 9; r++) {
      const row = ws.getRow(r);
      const out = [];
      for (let c = 1; c <= 12; c++) {
        let v = row.getCell(c).value;
        if (v && typeof v==='object' && 'result' in v) v = v.result;
        out.push(c+'='+JSON.stringify(v));
      }
      console.log(' R'+r+':', out.join('  '));
    }
    // distinct daily values across a sample
    const set = {};
    for (let r = 4; r <= Math.min(ws.rowCount, 200); r++) {
      const row = ws.getRow(r);
      for (let c = 5; c <= Math.min(ws.columnCount, 60); c++) {
        let v = row.getCell(c).value;
        if (v && typeof v==='object' && 'result' in v) v = v.result;
        const key = JSON.stringify(v);
        set[key] = (set[key]||0)+1;
      }
    }
    console.log(' distinct daily values (sample):', Object.entries(set).sort((a,b)=>b[1]-a[1]).slice(0,15).map(e=>e[0]+'×'+e[1]).join(', '));
  }
})().catch(e=>{console.error(e);process.exit(1)});
