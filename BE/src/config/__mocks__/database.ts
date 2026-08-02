/**
 * Manual Vitest mock for the Prisma client.
 *
 * Enabled per test file with `vi.mock('../config/database')`. Provides an
 * in-memory, fully stubbed PrismaClient so controller/service tests run
 * deterministically without a live MySQL connection.
 *
 * `$transaction(fn)` invokes the callback with the same mock (so nested
 * `tx.model.method()` calls hit the same stubs); `$transaction([..])` resolves
 * the array. Call `resetPrismaMock()` in `beforeEach` to clear call history.
 */
import { vi } from 'vitest';

const modelNames = [
  'user',
  'laporanAwal',
  'laporanAkhir',
  'reportValidation',
  'activityLog',
  'attachment',
  'rtupp',
  'team',
  'personil',
  'pushSubscription',
  'loginAttempt',
  'deviceToken',
  'refreshToken',
  'idempotencyKey',
  'laporanGi',
  'laporanGiAttachment',
  'laporanHarGi',
  'laporanInspeksiGh',
  'laporanHarGh',
  'laporanInspeksiMp',
  'laporanHarMp',
  'workOrder',
] as const;

const modelMethods = [
  'findUnique',
  'findFirst',
  'findMany',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'groupBy',
  'aggregate',
] as const;

type AnyMock = ReturnType<typeof vi.fn>;
type Model = Record<(typeof modelMethods)[number], AnyMock>;

function makeModel(): Model {
  const m = {} as Model;
  for (const method of modelMethods) {
    m[method] = vi.fn();
  }
  return m;
}

const buildClient = () => {
  const client: Record<string, unknown> = {};
  for (const name of modelNames) {
    client[name] = makeModel();
  }
  client.rTUPP = client.rtupp;

  // $transaction: support both the callback form and the array form.
  client.$transaction = vi.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => unknown)(client);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return undefined;
  });

  client.$queryRaw = vi.fn();
  client.$executeRaw = vi.fn();
  client.$connect = vi.fn();
  client.$disconnect = vi.fn();

  return client;
};

export const prisma = buildClient();

/** Reset all mock fns (call history + implementations) between tests. */
export const resetPrismaMock = (): void => {
  for (const name of modelNames) {
    const model = prisma[name] as Model;
    for (const method of modelMethods) {
      model[method].mockReset();
    }
  }
  (prisma.$transaction as AnyMock).mockClear();
  (prisma.$queryRaw as AnyMock).mockReset();
  (prisma.$executeRaw as AnyMock).mockReset();
};

export default prisma;
