import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export const skipTake = ({ page, limit }: PaginationQuery) => ({
  skip: (page - 1) * limit,
  take: limit,
});

/** Trims a search term and returns undefined for blanks, so `?search=` is a no-op. */
export const cleanSearch = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Upper bound for a date-range filter.
 *
 * `?to=2026-08-11` parses to midnight, which would exclude everything that happened
 * during that day. Users mean "up to and including the 11th", so a bare date is pushed
 * to the end of the day. A timestamp with a time component is left alone.
 */
export const inclusiveEndDate = z.coerce.date().transform((date) => {
  const isMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;

  if (!isMidnight) return date;

  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
});
