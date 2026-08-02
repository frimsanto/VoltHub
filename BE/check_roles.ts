import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log("=== CHECKING ROLES AND ENUMS ===");

  // 1. Get all roles from DB
  const roles = await prisma.role.findMany();
  console.log("Roles in Role table:", roles);

  // 2. Read UserRole enum from schema.prisma
  const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const enumMatch = schema.match(/enum\s+UserRole\s+\{[^}]*\}/);
  if (enumMatch) {
    console.log("UserRole enum in schema.prisma:\n", enumMatch[0]);
  } else {
    console.log("UserRole enum not found in schema.prisma");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
