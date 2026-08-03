import prisma from './src/config/database';
import { hashPassword } from './src/utils/password';

async function main() {
  const rtupp2 = await prisma.rTUPP.findFirst({ where: { code: 'RTUPP-2' } });
  if (!rtupp2) throw new Error('RTUPP-2 not found');
  const team = await prisma.team.findFirst({ where: { rtuppId: rtupp2.id } });
  if (!team) throw new Error('no team in RTUPP-2');

  const hash = await hashPassword('VerifyTemp123!');
  const admin = await prisma.user.upsert({
    where: { email: 'zz-verify-admin@voltreport.local' },
    update: { password: hash, isActive: true },
    create: { email: 'zz-verify-admin@voltreport.local', name: 'ZZ Verify Admin', password: hash, role: 'ADMIN' as never, rtuppId: rtupp2.id, isActive: true },
  });
  const petugas = await prisma.user.upsert({
    where: { email: 'zz-verify-petugas@voltreport.local' },
    update: { password: hash, isActive: true, teamId: team.id },
    create: { email: 'zz-verify-petugas@voltreport.local', name: 'ZZ Verify Petugas', password: hash, role: 'PETUGAS' as never, rtuppId: rtupp2.id, teamId: team.id, isActive: true },
  });
  console.log(JSON.stringify({ adminId: admin.id, petugasId: petugas.id, teamId: team.id, teamName: team.name, rtuppId: rtupp2.id }));
  await prisma.$disconnect();
}
main();
