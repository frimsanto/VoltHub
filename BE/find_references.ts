import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("=== SCANNING FOR USER REFERENCES ===");

  // 1. Get all users
  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} users in database.`);

  // 2. We want to check references in various tables.
  // Let's query information_schema to find all foreign keys pointing to the `users` table.
  const fks: any[] = await prisma.$queryRaw`
    SELECT 
      TABLE_NAME, 
      COLUMN_NAME, 
      CONSTRAINT_NAME, 
      REFERENCED_TABLE_NAME, 
      REFERENCED_COLUMN_NAME
    FROM 
      INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE 
      REFERENCED_TABLE_SCHEMA = 'voltreport' 
      AND REFERENCED_TABLE_NAME = 'users'
  `;

  console.log(`Found ${fks.length} foreign keys pointing to 'users' table.`);

  // For each user, let's check references in each table
  for (const user of users) {
    console.log(`\nUser: ${user.name} (${user.email}) [ID: ${user.id}]`);
    let totalRefs = 0;
    const refDetails: { table: string, column: string, count: number }[] = [];

    for (const fk of fks) {
      const tableName = fk.TABLE_NAME;
      const columnName = fk.COLUMN_NAME;

      try {
        // Query the count of rows pointing to this user
        const queryStr = `SELECT COUNT(*) as count FROM \`${tableName}\` WHERE \`${columnName}\` = '${user.id}'`;
        const result: any[] = await prisma.$queryRawUnsafe(queryStr);
        const count = Number(result[0].count);

        if (count > 0) {
          totalRefs += count;
          refDetails.push({ table: tableName, column: columnName, count });
        }
      } catch (err: any) {
        console.error(`Error querying ${tableName}.${columnName}:`, err.message);
      }
    }

    if (totalRefs > 0) {
      console.log(`  -> TOTAL REFERENCES: ${totalRefs}`);
      refDetails.forEach(detail => {
        console.log(`     - Table: ${detail.table}, Column: ${detail.column}, Count: ${detail.count}`);
      });
    } else {
      console.log(`  -> No references found in other tables.`);
    }
  }

  // 3. Let's also check if there are other tables or columns that might reference users without a formal FK (though query above is MySQL specific and looks for formal FKs).
  // Is there any references in tables that don't have FKs? Usually InnoDB enforces FKs, but just in case, let's make sure.

  await prisma.$disconnect();
}

main().catch(console.error);
