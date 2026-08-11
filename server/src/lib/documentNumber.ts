import type { Tx } from './prisma';

/**
 * Generates the next document number in a monthly series, e.g. CH-202608-0007.
 *
 * Implemented as a native `INSERT … ON CONFLICT DO UPDATE … RETURNING`, which is a
 * single atomic statement: Postgres takes a row lock on the counter, so concurrent
 * transactions queue behind it and each receives a distinct value.
 *
 * Prisma's `upsert()` is NOT safe here. It compiles to a SELECT followed by an INSERT
 * or UPDATE, so several concurrent transactions all read "no row", all attempt the
 * INSERT, and every one but the winner dies on the primary-key violation. That failure
 * mode was observed under an 8-way concurrent test before this was rewritten.
 *
 * Trade-off: because the lock is held until the surrounding transaction commits,
 * challan creation serialises on this row. That is the unavoidable cost of gap-free
 * sequential numbering, which finance and audit require. If throughput ever mattered
 * more than contiguity, the alternative is a Postgres SEQUENCE — lock-free, but it
 * leaves gaps whenever a transaction rolls back.
 */
export const nextDocumentNumber = async (
  tx: Tx,
  prefix: string,
  date = new Date(),
): Promise<string> => {
  const period = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const key = `${prefix}-${period}`;

  const rows = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO document_counters (key, value, updated_at)
         VALUES (${key}, 1, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = document_counters.value + 1, updated_at = NOW()
      RETURNING value
  `;

  return `${prefix}-${period}-${String(Number(rows[0].value)).padStart(4, '0')}`;
};
