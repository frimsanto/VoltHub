const ExcelJS = require('exceljs');
const path = require('path');
const dir = 'D:/VoltReport/dataset_scada';
const files = ['Laporan Gardu RC Aktif.xlsx','Laporan GH Aktif.xlsx','Laporan GI Aktif.xlsx'];
(async () => {
  for (const f of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(dir, f));
    console.log('\n==================================================');
    console.log('FILE:', f);
    wb.eachSheet(ws => {
      console.log('  SHEET:', ws.name, '| rows:', ws.rowCount, '| cols:', ws.columnCount);
      // print header row(s)
      for (let r = 1; r <= Math.min(3, ws.rowCount); r++) {
        const row = ws.getRow(r);
        const vals = [];
        row.eachCell({includeEmpty:true}, (cell,c) => { vals.push(c+':'+JSON.stringify(cell.value)); });
        console.log('    R'+r+':', vals.slice(0,30).join(' | '));
      }
    });
  }
})().catch(e=>{console.error(e);process.exit(1)});
