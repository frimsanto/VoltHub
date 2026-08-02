import fs from "fs";

const extractedPath =
  "C:/Users/Pongo/AppData/Local/Temp/claude/d--VoltReport/a95ab475-a0fa-427d-bec8-5e0bd7d0208d/scratchpad/extracted.json";

type RowMap = Record<string, unknown>;
type Dataset = { headers: Record<string, string>; rows: RowMap[] };

const raw = fs.readFileSync(extractedPath, "utf-8");
const data: Record<string, Dataset> = JSON.parse(raw);

function uniqVals(dsKey: string, col: number) {
  const ds = data[dsKey];
  const vals = ds.rows.map((r) => r[String(col)]);
  return vals;
}

console.log("--- har_gh BRAND MEDIA (col52) across all rows ---");
console.log(uniqVals("har_gh", 52));
console.log("--- har_gh MODEL MEDIA (col53) across all rows ---");
console.log(uniqVals("har_gh", 53));
console.log("--- har_gh MERK MEDIA (col62) across all rows ---");
console.log(uniqVals("har_gh", 62));
console.log("--- har_gh TYPE MEDIA (col63) across all rows ---");
console.log(uniqVals("har_gh", 63));
console.log("--- har_gh KONDISI RTU (col41) across all rows ---");
console.log(uniqVals("har_gh", 41));
console.log("--- har_gh KESIMPULAN KODISI RTU (col48) across all rows ---");
console.log(uniqVals("har_gh", 48));
console.log("--- har_gh KATEGORI RTU (col49) across all rows ---");
console.log(uniqVals("har_gh", 49));

console.log("\n--- har_mp BRAND MEDIA (col53) ---");
console.log(uniqVals("har_mp", 53));
console.log("--- har_mp MODEL MEDIA (col54) ---");
console.log(uniqVals("har_mp", 54));
console.log("--- har_mp MERK MEDIA (col63) ---");
console.log(uniqVals("har_mp", 63));
console.log("--- har_mp TYPE MEDIA (col64) ---");
console.log(uniqVals("har_mp", 64));
console.log("--- har_mp KESIMPULAN KODISI RTU (col49) ---");
console.log(uniqVals("har_mp", 49));

console.log("\n--- har_gi KONDISI I/O (col11) ---");
console.log(uniqVals("har_gi", 11));
console.log("--- har_gi STATUS PEKERJAAN (col77) ---");
console.log(uniqVals("har_gi", 77));

console.log("\n--- inspeksi_gh KESIMPULAN KODISI RTU (col48) ---");
console.log(uniqVals("inspeksi_gh", 48));
