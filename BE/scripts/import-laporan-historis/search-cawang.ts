import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const locs = await prisma.location.findMany({
    where: { name: { contains: "CAWANG" }, deletedAt: null },
    select: { code: true, name: true, locationType: true, up3: true },
  });
  console.log(locs);
  await prisma.$disconnect();
}
main();
