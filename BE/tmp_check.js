const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
 const idx=await p.$queryRawUnsafe("SELECT COUNT(*) c FROM information_schema.statistics WHERE table_schema='voltreport' AND table_name='locations' AND index_name='idx_locations_supply_feeder'");
 const fk=await p.$queryRawUnsafe("SELECT COUNT(*) c FROM information_schema.table_constraints WHERE table_schema='voltreport' AND table_name='locations' AND constraint_name='locations_supply_feeder_fk'");
 console.log('idx',Number(idx[0].c),'fk',Number(fk[0].c));
 await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
