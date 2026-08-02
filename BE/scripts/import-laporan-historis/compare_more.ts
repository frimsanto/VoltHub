import fs from "fs";
const raw = fs.readFileSync("C:/Users/Pongo/AppData/Local/Temp/claude/d--VoltReport/a95ab475-a0fa-427d-bec8-5e0bd7d0208d/scratchpad/extracted.json", "utf-8");
const data = JSON.parse(raw);
const gh = data.har_gh.rows;
const mp = data.har_mp.rows;
const gi = data.har_gi.rows;

let sameCount = 0;
for (let i = 0; i < gh.length; i++) {
  const g = gh[i], m = mp[i];
  // rectifier merk/type: gh col10/11, mp col11/12
  const gRect = [g["10"], g["11"], g["13"]]; // merk,type,kondisi
  const mRect = [m["11"], m["12"], m["14"]];
  const same = JSON.stringify(gRect) === JSON.stringify(mRect);
  if (same) sameCount++;
  console.log(`row${i} rectifier: GH=${JSON.stringify(gRect)} MP=${JSON.stringify(mRect)} same=${same}`);
}
console.log(`\nRectifier same rows: ${sameCount}/${gh.length}`);

// Check HAR GI dates/gardu against itself for internal repeats (merk pattern reused across GI too?)
console.log("\n--- HAR GI io merk/type per row (for eyeball check of templated pattern) ---");
for (const r of gi) {
  console.log(r["_row"], r["8"], r["9"], "|", r["4"]);
}
