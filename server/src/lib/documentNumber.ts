import type { Tx } from './prisma';

/**
 * Generates the next document number in a monthly series, e.g. CH-202608-0007.
 *
 * The counter lives in its own table and is bumped with an atomic upsert inside the
 * caller's transaction, so concurrent requests serialise on that row and can never be
 * handed the same number. `SELECT max(challan_number) + 1` would race here.
 */
export const nextDocumentNumber = async (
  tx: Tx,
  prefix: string,
  date = new Date(),
): Promise<string> => {
  const period = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const key = `${prefix}-${period}`;

  const counter = await tx.documentCounter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });

  return `${prefix}-${period}-${String(counter.value).padStart(4, '0')}`;
};
