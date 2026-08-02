import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();

const extractedPath =
  "C:/Users/Pongo/AppData/Local/Temp/claude/d--VoltReport/a95ab475-a0fa-427d-bec8-5e0bd7d0208d/scratchpad/extracted.json";

type RowMap = Record<string, unknown>;
type Dataset = { headers: Record<string, string>; rows: RowMap[] };

const CAWANG_LAMA_OVERRIDE = "GI-CAWANG"; // tentative, needs confirmation

async function resolveLocation(key: string, garduVal: string) {
  if (key === "har_gi") {
    if (garduVal === "CAWANG LAMA") {
      return prisma.location.findUnique({ where: { code: CAWANG_LAMA_OVERRIDE } });
    }
    return prisma.location.findFirst({
      where: { name: { contains: garduVal }, locationType: "GI", deletedAt: null },
    });
  }
  return prisma.location.findFirst({ where: { code: garduVal, deletedAt: null } });
}

async function main() {
  const raw = fs.readFileSync(extractedPath, "utf-8");
  const data: Record<string, Dataset> = JSON.parse(raw);

  const cfg: Record<
    string,
    { garduCol: number; rtu: { merk: number; type: number; sn: number; kondisi: number }; media?: { brand: number; model: number } }
  > = {
    har_gi: { garduCol: 4, rtu: { merk: 8, type: 9, sn: 10, kondisi: 11 } },
    har_gh: { garduCol: 5, rtu: { merk: 38, type: 39, sn: 40, kondisi: 41 }, media: { brand: 52, model: 53 } },
    har_mp: { garduCol: 5, rtu: { merk: 39, type: 40, sn: 41, kondisi: 42 }, media: { brand: 53, model: 54 } },
    inspeksi_gh: { garduCol: 5, rtu: { merk: 38, type: 39, sn: 40, kondisi: 41 }, media: { brand: 52, model: 53 } },
  };

  const clean = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v).trim();
    return s === "" || s === "-" ? null : s;
  };

  for (const key of Object.keys(data)) {
    const ds = data[key];
    const c = cfg[key];
    console.log(`\n=== ${key} ===`);

    for (const row of ds.rows) {
      const garduVal = String(row[String(c.garduCol)] ?? "").trim();
      const loc = await resolveLocation(key, garduVal);
      if (!loc) {
        console.log(`  row${row._row}: NO LOCATION for '${garduVal}'`);
        continue;
      }

      const merkRtu = clean(row[String(c.rtu.merk)]);
      const typeRtu = clean(row[String(c.rtu.type)]);
      const snRtu = clean(row[String(c.rtu.sn)]);
      const kondisiRtu = clean(row[String(c.rtu.kondisi)]);

      const rtuAssets = await prisma.asset.findMany({
        where: { locationId: loc.id, assetType: "RTU", deletedAt: null },
        select: { id: true, assetCode: true, brand: true, model: true, serialNumber: true, status: true },
      });

      let mediaAssets: any[] = [];
      let brandMedia: string | null = null;
      let modelMedia: string | null = null;
      if (c.media) {
        brandMedia = clean(row[String(c.media.brand)]);
        modelMedia = clean(row[String(c.media.model)]);
        mediaAssets = await prisma.asset.findMany({
          where: { locationId: loc.id, assetType: { in: ["MODEM", "RADIO"] }, deletedAt: null },
          select: { id: true, assetCode: true, assetType: true, brand: true, model: true },
        });
      }

      console.log(
        `  row${row._row} [${loc.code}]: RTU excel(merk=${merkRtu},type=${typeRtu},sn=${snRtu},kondisi=${kondisiRtu}) -> DB RTU assets: ${JSON.stringify(rtuAssets)}`
      );
      if (c.media) {
        console.log(
          `             MEDIA excel(brand=${brandMedia},model=${modelMedia}) -> DB MODEM/RADIO assets: ${JSON.stringify(mediaAssets)}`
        );
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
