import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/apiError';
import { cleanSearch, skipTake } from '../../lib/pagination';
import { buildPaginationMeta } from '../../lib/http';
import type {
  CreateCustomerInput,
  CreateFollowUpInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from './customers.schema';

const creatorSelect = { select: { id: true, name: true, role: true } };

export const listCustomers = async (query: ListCustomersQuery) => {
  const search = cleanSearch(query.search);

  const where: Prisma.CustomerWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.dueFollowUps ? { followUpDate: { lte: new Date() } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { mobile: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
            { businessName: { contains: search, mode: 'insensitive' } },
            { gstNumber: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      ...skipTake(query),
      orderBy: { [query.sortBy]: query.sortOrder },
      include: {
        createdBy: creatorSelect,
        _count: { select: { followUps: true, challans: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    data: customers,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

export const getCustomerById = async (id: string) => {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      createdBy: creatorSelect,
      followUps: {
        orderBy: { createdAt: 'desc' },
        include: { createdBy: creatorSelect },
      },
      challans: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          challanNumber: true,
          status: true,
          totalQuantity: true,
          totalAmount: true,
          createdAt: true,
        },
      },
    },
  });

  if (!customer) throw ApiError.notFound('Customer not found');
  return customer;
};

export const createCustomer = async (input: CreateCustomerInput, userId: string) => {
  // Mobile is the practical business key for a distributor's customer list — warn on
  // duplicates rather than silently creating a second record for the same person.
  const duplicate = await prisma.customer.findFirst({ where: { mobile: input.mobile } });
  if (duplicate) {
    throw ApiError.conflict(`A customer with mobile ${input.mobile} already exists`, {
      existingCustomerId: duplicate.id,
    });
  }

  return prisma.customer.create({
    data: { ...input, createdById: userId },
    include: { createdBy: creatorSelect },
  });
};

export const updateCustomer = async (id: string, input: UpdateCustomerInput) => {
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Customer not found');

  if (input.mobile && input.mobile !== existing.mobile) {
    const duplicate = await prisma.customer.findFirst({
      where: { mobile: input.mobile, NOT: { id } },
    });
    if (duplicate) {
      throw ApiError.conflict(`Another customer already uses mobile ${input.mobile}`);
    }
  }

  return prisma.customer.update({
    where: { id },
    data: input,
    include: { createdBy: creatorSelect },
  });
};

export const deleteCustomer = async (id: string) => {
  const challanCount = await prisma.challan.count({ where: { customerId: id } });
  if (challanCount > 0) {
    throw ApiError.conflict(
      `Cannot delete a customer with ${challanCount} challan(s). Mark them Inactive instead.`,
    );
  }

  await prisma.customer.delete({ where: { id } });
  return { message: 'Customer deleted successfully' };
};

export const addFollowUp = async (
  customerId: string,
  input: CreateFollowUpInput,
  userId: string,
) => {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw ApiError.notFound('Customer not found');

  // Writing the note and advancing the customer's next-follow-up date is one logical
  // action, so it happens in one transaction.
  const [followUp] = await prisma.$transaction([
    prisma.followUp.create({
      data: {
        customerId,
        note: input.note,
        nextFollowUp: input.nextFollowUp,
        createdById: userId,
      },
      include: { createdBy: creatorSelect },
    }),
    prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(input.nextFollowUp ? { followUpDate: input.nextFollowUp } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
    }),
  ]);

  return followUp;
};

export const listFollowUps = async (customerId: string) => {
  const exists = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!exists) throw ApiError.notFound('Customer not found');

  return prisma.followUp.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    include: { createdBy: creatorSelect },
  });
};
