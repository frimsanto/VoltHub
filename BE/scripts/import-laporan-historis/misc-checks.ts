import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const masterUsers = await prisma.user.findMany({
    where: { role: "MASTER" },
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  console.log("MASTER users:", masterUsers);

  const counts = await Promise.all([
    prisma.laporanHarGi.count(),
    prisma.laporanHarGh.count(),
    prisma.laporanHarMp.count(),
    prisma.laporanInspeksiGh.count(),
    prisma.workOrder.count(),
  ]);
  console.log("Existing counts [harGi, harGh, harMp, inspeksiGh, workOrders]:", counts);

  const mpCodes = ["KJ394","CN111","TD63","KDR240","KDR207","KB125","PS62","TD413","T7","PG111","SP65","T182","BK284","CP25A","P29","KS7N","CP437"];
  const mpLocs = await prisma.location.findMany({
    where: { code: { in: mpCodes } },
    select: { code: true, supplyFeederId: true, supplyFeeder: { select: { feederCode: true, feederName: true } } },
  });
  console.log("MP locations supplyFeeder:", mpLocs);

  // Sample WorkOrder to see woNumber pattern
  const sampleWo = await prisma.workOrder.findMany({ take: 3, select: { woNumber: true, type: true, status: true } });
  console.log("Sample WO numbers:", sampleWo);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
