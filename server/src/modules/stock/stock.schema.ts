import { MovementType } from '@prisma/client';
import { z } from 'zod';
import { paginationSchema } from '../../lib/pagination';

export const createMovementSchema = z.object({
  productId: z.string().uuid('A valid product id is required'),
  quantity: z.coerce.number().int().positive('Quantity must be a positive whole number'),
  type: z.nativeEnum(MovementType, {
    errorMap: () => ({ message: 'Movement type must be IN or OUT' }),
  }),
  reason: z.string().trim().min(2, 'Reason is required').max(200),
});

export const listMovementsSchema = paginationSchema.extend({
  productId: z.string().uuid().optional(),
  type: z.nativeEnum(MovementType).optional(),
  search: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateMovementInput = z.infer<typeof createMovementSchema>;
export type ListMovementsQuery = z.infer<typeof listMovementsSchema>;
