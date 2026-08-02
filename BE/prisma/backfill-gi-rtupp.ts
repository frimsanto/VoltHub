import prisma from '../src/config/database';
import { isRtupp1 } from '../src/modules/locations/location.constants';

/**
 * Run the GI locations rtuppId backfill logic.
 * Exposing this makes it testable in unit/integration tests without running the CLI process.
 */
export async function runBackfill(db: typeof prisma, args: string[]): Promise<{ count: number; status: 'SUCCESS' | 'NO_OP' | 'DRY_RUN' }> {
  const isApply = args.includes('--apply');
  const isDryRun = !isApply;

  console.log(`🏁 Starting GI location rtuppId backfill... [Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}]`);

  // 1. Find all RTUPPs
  const rtupps = await db.rTUPP.findMany();
  
  // 2. Identify RTUPP1
  const rtupp1 = rtupps.find(r => isRtupp1(r));
  if (!rtupp1) {
    throw new Error('RTUPP1 not found in database. Cannot proceed.');
  }
  
  console.log(`📍 Target RTUPP1: ${rtupp1.name} (ID: ${rtupp1.id}, Code: ${rtupp1.code})`);

  // 3. Count GI locations in DB and their current rtuppId mappings
  const allGIs = await db.location.findMany({
    where: {
      locationType: 'GI',
      deletedAt: null,
    },
  });

  const needUpdate = allGIs.filter(g => g.rtuppId !== rtupp1.id);
  const alreadyCorrect = allGIs.filter(g => g.rtuppId === rtupp1.id);

  console.log(`📊 Statistics:`);
  console.log(`   - Total GI locations in DB: ${allGIs.length}`);
  console.log(`   - GI locations already mapped to RTUPP1: ${alreadyCorrect.length}`);
  console.log(`   - GI locations needing update: ${needUpdate.length}`);

  if (needUpdate.length === 0) {
    console.log('ℹ️ All GI locations are already assigned to RTUPP1. No changes needed.');
    return { count: 0, status: 'NO_OP' };
  }

  if (isDryRun) {
    console.log('\n🔍 [DRY-RUN] The following GI locations would be updated to RTUPP1:');
    needUpdate.forEach(g => {
      console.log(`   * Code: ${g.code} | Name: ${g.name} | Current rtuppId: ${g.rtuppId || 'NULL'}`);
    });
    console.log('\n💡 To apply these changes, run this script with the --apply flag.');
    return { count: needUpdate.length, status: 'DRY_RUN' };
  } else {
    console.log(`\n💾 [APPLY] Updating ${needUpdate.length} GI locations in a transaction...`);
    
    // Execute inside transaction
    const result = await db.$transaction(async (tx) => {
      const updateResult = await tx.location.updateMany({
        where: {
          id: { in: needUpdate.map(g => g.id) },
        },
        data: {
          rtuppId: rtupp1.id,
        },
      });
      return updateResult;
    });

    console.log(`✅ Success! Updated ${result.count} GI locations.`);
    return { count: result.count, status: 'SUCCESS' };
  }
}

// CLI entry point
const isCli =
  typeof process.argv[1] === 'string' &&
  /backfill-gi-rtupp\.ts$/.test(process.argv[1].replace(/\\/g, '/'));

if (isCli) {
  runBackfill(prisma, process.argv.slice(2))
    .catch((e) => {
      console.error('❌ Backfill failed:', e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
