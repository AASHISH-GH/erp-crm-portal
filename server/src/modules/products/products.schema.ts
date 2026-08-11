import { z } from 'zod';
import { paginationSchema } from '../../lib/pagination';

export const createProductSchema = z.object({
  name: z.string().trim().min(2, 'Product name must be at least 2 characters').max(150),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'SKU must be at least 2 characters')
    .max(50)
    .regex(/^[A-Z0-9-_]+$/, 'SKU may only contain letters, numbers, hyphens and underscores'),
  category: z.string().trim().min(2, 'Category is required').max(80),
  unitPrice: z.coerce.number().nonnegative('Unit price cannot be negative').max(99_999_999),
  // Opening stock. Every later change must go through the stock-movement endpoints so
  // the ledger stays the single explanation for the on-hand number.
  currentStock: z.coerce.number().int().min(0, 'Stock cannot be negative').default(0),
  minStockAlert: z.coerce.number().int().min(0, 'Minimum stock alert cannot be negative').default(0),
  location: z.string().trim().max(80).default('MAIN'),
  isActive: z.boolean().default(true),
});

// currentStock is deliberately omitted: stock is only movable through /stock/movements,
// which keeps the ledger and the on-hand quantity impossible to desynchronise.
export const updateProductSchema = createProductSchema
  .omit({ currentStock: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listProductsSchema = paginationSchema.extend({
  search: z.string().optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  lowStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  sortBy: z.enum(['createdAt', 'name', 'currentStock', 'unitPrice']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const productIdParamSchema = z.object({
  id: z.string().uuid('Invalid product id'),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsSchema>;
