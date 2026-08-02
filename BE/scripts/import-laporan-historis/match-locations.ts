import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const extractedPath =
  "C:/Users/Pongo/AppData/Local/Temp/claude/d--VoltReport/a95ab475-a0fa-427d-bec8-5e0bd7d0208d/scratchpad/extracted.json";

type RowMap = Record<string, unknown>;
type Dataset = { headers: Record<string, string>; rows: RowMap[] };

async function main() {
  const raw = fs.readFileSync(extractedPath, "utf-8");
  const data: Record<string, Dataset> = JSON.parse(raw);

  const garduCol: Record<string, number> = {
    har_gi: 4,
    har_gh: 5,
    har_mp: 5,
    inspeksi_gh: 5,
  };
  const up3Col: Record<string, number> = {
    har_gi: 6,
    har_gh: 4,
    har_mp: 4,
    inspeksi_gh: 4,
  };
  const isNameJoin: Record<string, boolean> = {
    har_gi: true, // GARDU INDUK -> Location.name
    har_gh: false, // code
    har_mp: false, // code
    inspeksi_gh: false, // code
  };

  for (const key of Object.keys(data)) {
    const ds = data[key];
    const gc = garduCol[key];
    const uc = up3Col[key];
    console.log(`\n=== ${key} (${ds.rows.length} rows) ===`);

    let matched = 0;
    const unmatched: string[] = [];

    for (const row of ds.rows) {
      const garduVal = String(row[String(gc)] ?? "").trim();
      const up3Val = String(row[String(uc)] ?? "").trim();
      if (!garduVal) continue;

      let loc;
      if (isNameJoin[key]) {
        loc = await prisma.location.findFirst({
          where: {
            name: { contains: garduVal },
            locationType: "GI",
            deletedAt: null,
          },
          select: { id: true, code: true, name: true, up3: true, rtuppId: true, locationType: true },
        });
      } else {
        loc = await prisma.location.findFirst({
          where: { code: garduVal, deletedAt: null },
          select: { id: true, code: true, name: true, up3: true, rtuppId: true, locationType: true },
        });
      }

      if (loc) {
        matched++;
        console.log(
          `  row${row._row}: OK  gardu='${garduVal}' up3Excel='${up3Val}' -> Location(code=${loc.code}, name=${loc.name}, type=${loc.locationType}, up3DB=${loc.up3}, rtuppId=${loc.rtuppId})`
        );
      } else {
        unmatched.push(garduVal);
        console.log(`  row${row._row}: MISS gardu='${garduVal}' up3Excel='${up3Val}'`);
      }
    }
    console.log(`-> Match: ${matched}/${ds.rows.length}. Unmatched: ${JSON.stringify(unmatched)}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
