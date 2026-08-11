import { ChallanStatus } from '@prisma/client';
import { z } from 'zod';
import { paginationSchema } from '../../lib/pagination';

const challanItemSchema = z.object({
  productId: z.string().uuid('A valid product id is required'),
  quantity: z.coerce.number().int().positive('Quantity must be a positive whole number'),
  // Optional price override for negotiated deals; falls back to the product master price.
  unitPrice: z.coerce.number().nonnegative().optional(),
});

export const createChallanSchema = z.object({
  customerId: z.string().uuid('A valid customer id is required'),
  items: z
    .array(challanItemSchema)
    .min(1, 'A challan must contain at least one product line')
    .max(100, 'A challan cannot contain more than 100 lines')
    .refine(
      (items) => new Set(items.map((item) => item.productId)).size === items.length,
      { message: 'The same product cannot appear on two lines — combine the quantities instead' },
    ),
  notes: z.string().trim().max(1000).optional(),
  // DRAFT reserves nothing; CONFIRMED deducts stock immediately in the same transaction.
  status: z
    .enum([ChallanStatus.DRAFT, ChallanStatus.CONFIRMED])
    .default(ChallanStatus.DRAFT),
});

export const updateChallanSchema = z.object({
  items: z
    .array(challanItemSchema)
    .min(1, 'A challan must contain at least one product line')
    .max(100)
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length, {
      message: 'The same product cannot appear on two lines — combine the quantities instead',
    })
    .optional(),
  notes: z.string().trim().max(1000).optional(),
  customerId: z.string().uuid().optional(),
});

export const listChallansSchema = paginationSchema.extend({
  search: z.string().optional(),
  status: z.nativeEnum(ChallanStatus).optional(),
  customerId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortBy: z.enum(['createdAt', 'challanNumber', 'totalAmount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const challanIdParamSchema = z.object({
  id: z.string().uuid('Invalid challan id'),
});

export const cancelChallanSchema = z.object({
  reason: z.string().trim().min(2, 'A cancellation reason is required').max(200),
});

export type CreateChallanInput = z.infer<typeof createChallanSchema>;
export type UpdateChallanInput = z.infer<typeof updateChallanSchema>;
export type ListChallansQuery = z.infer<typeof listChallansSchema>;
export type CancelChallanInput = z.infer<typeof cancelChallanSchema>;
