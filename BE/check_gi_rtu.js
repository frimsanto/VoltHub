const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const RTU = 'd:\\VoltReport\\dataset_scada\\csd_IFS-IFS_RTUs10622026.xlsx';
const norm = (v) => (v == null ? '' : v.toString().trim());
const upper = (s) => s.trim().toUpperCase();

async function main() {
  try {
    const giLocations = await prisma.location.findMany({
      where: { locationType: 'GI' },
      select: { id: true, code: true, name: true }
    });

    const giSet = new Set();
    const giNameMap = new Map();
    giLocations.forEach(loc => {
      giSet.add(upper(loc.name));
      giNameMap.set(upper(loc.name), loc);
      if (loc.code) {
        giSet.add(upper(loc.code));
        giNameMap.set(upper(loc.code), loc);
      }
    });

    console.log(`Loaded ${giLocations.length} GI locations from DB.`);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(RTU);
    const ws = wb.worksheets[0];

    const matchedGiRows = [];
    
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const name = norm(row.getCell(1).text);
      if (!name) continue;
      const key = upper(name);

      // Check if exact match or contains name
      let match = null;
      if (giSet.has(key)) {
        match = giNameMap.get(key);
      } else {
        // partial match check
        for (const [giKey, loc] of giNameMap.entries()) {
          if (key.includes(giKey) || giKey.includes(key)) {
            match = loc;
            break;
          }
        }
      }

      if (match) {
        matchedGiRows.push({
          rowNum: r,
          rtuName: name,
          matchedGi: match.name,
          matchedGiCode: match.code
        });
      }
    }

    console.log(`Total matched GI rows in RTU sheet: ${matchedGiRows.length}`);
    console.log(`Matched samples:`, matchedGiRows.slice(0, 15));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
