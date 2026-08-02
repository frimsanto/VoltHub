import { PrismaClient } from '@prisma/client';
async function main() {
  const p = new PrismaClient();
  const r = {
    assets: await p.asset.count(),
    locations: await p.location.count(),
    users: await p.user.count(),
    feeders: await p.feeder.count(),
    laporanAwal: await p.laporanAwal.count(),
    scadaGardu: await p.scadaGardu.count(),
  };
  console.log(JSON.stringify(r, null, 2));
  await p.$disconnect();
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
