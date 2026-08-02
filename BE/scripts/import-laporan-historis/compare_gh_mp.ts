import fs from "fs";
const raw = fs.readFileSync("C:/Users/Pongo/AppData/Local/Temp/claude/d--VoltReport/a95ab475-a0fa-427d-bec8-5e0bd7d0208d/scratchpad/extracted.json", "utf-8");
const data = JSON.parse(raw);

const gh = data.har_gh.rows;
const mp = data.har_mp.rows;

// har_mp has +1 col offset from col6 onward (extra PENYULANG col). Compare RTU section:
// har_gh: MERK RTU=38,TYPE=39,SN=40,KONDISI=41 ; har_mp: MERK RTU=39,TYPE=40,SN=41,KONDISI=42
for (let i = 0; i < gh.length; i++) {
  const g = gh[i], m = mp[i];
  const gVal = [g["38"], g["39"], g["40"], g["41"]];
  const mVal = [m["39"], m["40"], m["41"], m["42"]];
  console.log(`row${i}: GH(${g["5"]})=${JSON.stringify(gVal)}  MP(${m["5"]})=${JSON.stringify(mVal)}  match=${JSON.stringify(gVal)===JSON.stringify(mVal)}`);
}
