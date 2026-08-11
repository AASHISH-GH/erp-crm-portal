import { CustomerStatus, CustomerType } from '@prisma/client';
import { z } from 'zod';
import { paginationSchema } from '../../lib/pagination';

// Indian mobile format, tolerant of +91 / 0 prefixes and spacing.
const mobileSchema = z
  .string()
  .trim()
  .regex(/^(\+?91[-\s]?)?[0]?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');

// 15-char GSTIN: 2 state digits, 10-char PAN, 1 entity digit, 'Z', 1 checksum char.
const gstSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/,
    'Enter a valid 15-character GST number (e.g. 27AAPFU0939F1ZV)',
  );

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' || value === null ? undefined : value), schema.optional());

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(150),
  mobile: mobileSchema,
  email: emptyToUndefined(z.string().trim().toLowerCase().email('Enter a valid email address')),
  businessName: emptyToUndefined(z.string().trim().max(150)),
  gstNumber: emptyToUndefined(gstSchema),
  type: z.nativeEnum(CustomerType).default(CustomerType.RETAIL),
  address: emptyToUndefined(z.string().trim().max(500)),
  status: z.nativeEnum(CustomerStatus).default(CustomerStatus.LEAD),
  followUpDate: emptyToUndefined(z.coerce.date()),
  notes: emptyToUndefined(z.string().trim().max(2000)),
});

export const updateCustomerSchema = createCustomerSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update' },
);

export const listCustomersSchema = paginationSchema.extend({
  search: z.string().optional(),
  status: z.nativeEnum(CustomerStatus).optional(),
  type: z.nativeEnum(CustomerType).optional(),
  // Convenience filter for the "who do I need to call today" dashboard tile.
  dueFollowUps: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  sortBy: z.enum(['createdAt', 'name', 'followUpDate']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createFollowUpSchema = z.object({
  note: z.string().trim().min(2, 'Follow-up note is required').max(2000),
  nextFollowUp: emptyToUndefined(z.coerce.date()),
  // Optionally move the customer along the pipeline in the same action.
  status: z.nativeEnum(CustomerStatus).optional(),
});

export const customerIdParamSchema = z.object({
  id: z.string().uuid('Invalid customer id'),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersSchema>;
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;
