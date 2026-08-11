import { ChallanStatus, MovementType, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../../lib/prisma';
import { ApiError } from '../../lib/apiError';
import { cleanSearch, skipTake } from '../../lib/pagination';
import { buildPaginationMeta } from '../../lib/http';
import { nextDocumentNumber } from '../../lib/documentNumber';
import { applyMovement } from '../stock/stock.service';
import type {
  CreateChallanInput,
  ListChallansQuery,
  UpdateChallanInput,
} from './challans.schema';

/**
 * Challan writes serialise on the document-counter row, so under concurrent load a
 * transaction can spend real time queueing before it does any work. Prisma's defaults
 * (2s maxWait, 5s timeout) are too tight for that plus cloud-database round-trips —
 * they surfaced as P2028 "transaction already closed" under an 8-way concurrent test.
 *
 * These limits are generous enough to absorb a burst while still bounding a stuck
 * transaction. The companion optimisation is keeping read-only work outside the
 * transaction so the lock is held for as short a time as possible.
 */
const TX_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

const challanInclude = {
  items: { orderBy: { productName: 'asc' } },
  customer: { select: { id: true, name: true, businessName: true, mobile: true, status: true } },
  createdBy: { select: { id: true, name: true, role: true } },
} satisfies Prisma.ChallanInclude;

interface PreparedLine {
  productId: string;
  productName: string;
  productSku: string;
  productCategory: string;
  unitPrice: Prisma.Decimal;
  quantity: number;
  lineTotal: Prisma.Decimal;
}

/**
 * Resolves incoming {productId, quantity} lines into fully snapshotted challan lines.
 *
 * The snapshot is the point: a challan printed today must still show the price and
 * description that were agreed today, even after the product master is renamed or
 * repriced tomorrow. Storing only productId would silently rewrite history.
 */
const prepareLines = async (
  tx: Tx,
  items: CreateChallanInput['items'],
): Promise<{ lines: PreparedLine[]; totalQuantity: number; totalAmount: Prisma.Decimal }> => {
  const products = await tx.product.findMany({
    where: { id: { in: items.map((item) => item.productId) } },
  });

  const productById = new Map(products.map((product) => [product.id, product]));

  const missing = items
    .filter((item) => !productById.has(item.productId))
    .map((item) => item.productId);

  if (missing.length > 0) {
    throw ApiError.badRequest('One or more products on this challan no longer exist', {
      missingProductIds: missing,
    });
  }

  const inactive = products.filter((product) => !product.isActive);
  if (inactive.length > 0) {
    throw ApiError.unprocessable(
      `These products are deactivated and cannot be sold: ${inactive
        .map((product) => product.sku)
        .join(', ')}`,
      'PRODUCT_INACTIVE',
    );
  }

  const lines = items.map((item) => {
    const product = productById.get(item.productId)!;
    const unitPrice =
      item.unitPrice !== undefined ? new Prisma.Decimal(item.unitPrice) : product.unitPrice;

    return {
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      productCategory: product.category,
      unitPrice,
      quantity: item.quantity,
      lineTotal: unitPrice.mul(item.quantity),
    };
  });

  return {
    lines,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    totalAmount: lines.reduce((sum, line) => sum.add(line.lineTotal), new Prisma.Decimal(0)),
  };
};

/**
 * Deducts stock for every line of a challan.
 *
 * Lines are processed in a deterministic (product id) order so two concurrent
 * confirmations touching the same products always take row locks in the same sequence
 * and cannot deadlock each other.
 */
const deductStockForChallan = async (
  tx: Tx,
  challan: { id: string; challanNumber: string; items: PreparedLine[] },
  userId: string,
) => {
  const ordered = [...challan.items].sort((a, b) => a.productId.localeCompare(b.productId));

  for (const line of ordered) {
    await applyMovement(tx, {
      productId: line.productId,
      quantity: line.quantity,
      type: MovementType.OUT,
      reason: `Sales challan ${challan.challanNumber}`,
      referenceType: 'CHALLAN',
      referenceId: challan.id,
      userId,
    });
  }
};

export const createChallan = async (input: CreateChallanInput, userId: string) => {
  // Resolving the customer and building the line snapshots is read-only, so it happens
  // *before* the transaction opens. Keeping it inside would hold the counter lock for
  // the duration of several extra round-trips and throttle concurrent challan creation
  // for no benefit: the snapshot is a deliberate point-in-time copy, and the stock
  // guarantee comes from the conditional UPDATE, not from these reads.
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw ApiError.notFound('Customer not found');

  const { lines, totalQuantity, totalAmount } = await prepareLines(prisma, input.items);

  return prisma.$transaction(async (tx) => {
    const challanNumber = await nextDocumentNumber(tx, 'CH');

    const challan = await tx.challan.create({
      data: {
        challanNumber,
        customerId: customer.id,
        // Customer snapshot — see schema.prisma for why.
        customerName: customer.name,
        customerBusinessName: customer.businessName,
        customerMobile: customer.mobile,
        customerGstNumber: customer.gstNumber,
        customerAddress: customer.address,
        status: input.status,
        totalQuantity,
        totalAmount,
        notes: input.notes,
        createdById: userId,
        confirmedAt: input.status === ChallanStatus.CONFIRMED ? new Date() : null,
        items: { create: lines },
      },
      include: challanInclude,
    });

    // Stock only moves on confirmation. A draft is a working document and must not
    // reserve or consume inventory.
    if (input.status === ChallanStatus.CONFIRMED) {
      await deductStockForChallan(tx, { ...challan, items: lines }, userId);
    }

    return challan;
  }, TX_OPTIONS);
};

export const confirmChallan = async (id: string, userId: string) =>
  prisma.$transaction(async (tx) => {
    const challan = await tx.challan.findUnique({ where: { id }, include: { items: true } });
    if (!challan) throw ApiError.notFound('Challan not found');

    if (challan.status === ChallanStatus.CONFIRMED) {
      throw ApiError.conflict('This challan is already confirmed');
    }
    if (challan.status === ChallanStatus.CANCELLED) {
      throw ApiError.conflict('A cancelled challan cannot be confirmed');
    }

    // A line whose product was deleted has a null productId (onDelete: SetNull). Its
    // snapshot still prints correctly, but there is no stock to deduct, so confirming
    // would silently ship goods the ledger never accounts for. Refuse instead.
    const orphanedLines = challan.items.filter((item) => item.productId === null);
    if (orphanedLines.length > 0) {
      throw ApiError.unprocessable(
        `Cannot confirm: ${orphanedLines
          .map((item) => item.productSku)
          .join(', ')} no longer exist in the product master. Cancel this challan and raise a new one.`,
        'PRODUCT_DELETED',
      );
    }

    await deductStockForChallan(
      tx,
      {
        id: challan.id,
        challanNumber: challan.challanNumber,
        items: challan.items as unknown as PreparedLine[],
      },
      userId,
    );

    return tx.challan.update({
      where: { id },
      data: { status: ChallanStatus.CONFIRMED, confirmedAt: new Date() },
      include: challanInclude,
    });
  }, TX_OPTIONS);

export const cancelChallan = async (id: string, reason: string, userId: string) =>
  prisma.$transaction(async (tx) => {
    const challan = await tx.challan.findUnique({ where: { id }, include: { items: true } });
    if (!challan) throw ApiError.notFound('Challan not found');

    if (challan.status === ChallanStatus.CANCELLED) {
      throw ApiError.conflict('This challan is already cancelled');
    }

    // Cancelling a confirmed challan returns the goods to the shelf. The reversal is
    // written as IN movements rather than by deleting the original OUT rows, so the
    // ledger keeps a truthful record of what actually happened.
    if (challan.status === ChallanStatus.CONFIRMED) {
      const ordered = [...challan.items].sort((a, b) =>
        (a.productId ?? '').localeCompare(b.productId ?? ''),
      );

      for (const line of ordered) {
        if (!line.productId) continue; // product was deleted; nothing to restore
        await applyMovement(tx, {
          productId: line.productId,
          quantity: line.quantity,
          type: MovementType.IN,
          reason: `Cancellation of challan ${challan.challanNumber}: ${reason}`,
          referenceType: 'CHALLAN_CANCEL',
          referenceId: challan.id,
          userId,
        });
      }
    }

    return tx.challan.update({
      where: { id },
      data: {
        status: ChallanStatus.CANCELLED,
        cancelledAt: new Date(),
        notes: challan.notes
          ? `${challan.notes}\n[Cancelled] ${reason}`
          : `[Cancelled] ${reason}`,
      },
      include: challanInclude,
    });
  }, TX_OPTIONS);

export const updateChallan = async (id: string, input: UpdateChallanInput) =>
  prisma.$transaction(async (tx) => {
    const challan = await tx.challan.findUnique({ where: { id } });
    if (!challan) throw ApiError.notFound('Challan not found');

    // Once stock has moved, the document is a record of a physical event and is no
    // longer editable — cancel and reissue instead.
    if (challan.status !== ChallanStatus.DRAFT) {
      throw ApiError.conflict(
        `Only draft challans can be edited. This challan is ${challan.status}.`,
      );
    }

    const data: Prisma.ChallanUpdateInput = {
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };

    if (input.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw ApiError.notFound('Customer not found');
      Object.assign(data, {
        customer: { connect: { id: customer.id } },
        customerName: customer.name,
        customerBusinessName: customer.businessName,
        customerMobile: customer.mobile,
        customerGstNumber: customer.gstNumber,
        customerAddress: customer.address,
      });
    }

    if (input.items) {
      const { lines, totalQuantity, totalAmount } = await prepareLines(tx, input.items);
      await tx.challanItem.deleteMany({ where: { challanId: id } });
      Object.assign(data, {
        totalQuantity,
        totalAmount,
        items: { create: lines },
      });
    }

    return tx.challan.update({ where: { id }, data, include: challanInclude });
  }, TX_OPTIONS);

export const listChallans = async (query: ListChallansQuery) => {
  const search = cleanSearch(query.search);

  const where: Prisma.ChallanWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { challanNumber: { contains: search, mode: 'insensitive' } },
            { customerName: { contains: search, mode: 'insensitive' } },
            { customerBusinessName: { contains: search, mode: 'insensitive' } },
            { customerMobile: { contains: search } },
          ],
        }
      : {}),
  };

  const [challans, total] = await Promise.all([
    prisma.challan.findMany({
      where,
      ...skipTake(query),
      orderBy: { [query.sortBy]: query.sortOrder },
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.challan.count({ where }),
  ]);

  return { data: challans, meta: buildPaginationMeta(query.page, query.limit, total) };
};

export const getChallanById = async (id: string) => {
  const challan = await prisma.challan.findUnique({ where: { id }, include: challanInclude });
  if (!challan) throw ApiError.notFound('Challan not found');
  return challan;
};

export const deleteChallan = async (id: string) => {
  const challan = await prisma.challan.findUnique({ where: { id } });
  if (!challan) throw ApiError.notFound('Challan not found');

  if (challan.status !== ChallanStatus.DRAFT) {
    throw ApiError.conflict(
      'Only draft challans can be deleted. Cancel the challan instead to keep the audit trail.',
    );
  }

  await prisma.challan.delete({ where: { id } });
  return { message: 'Draft challan deleted successfully' };
};
