import { MovementType, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../../lib/prisma';
import { ApiError } from '../../lib/apiError';
import { cleanSearch, skipTake } from '../../lib/pagination';
import { buildPaginationMeta } from '../../lib/http';
import type { CreateMovementInput, ListMovementsQuery } from './stock.schema';

interface ApplyMovementArgs {
  productId: string;
  quantity: number;
  type: MovementType;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  userId: string;
}

/**
 * The single choke point through which stock is allowed to change.
 *
 * The decrement is written as one conditional UPDATE (`WHERE current_stock >= qty`)
 * rather than read-then-write. Postgres takes a row lock for the duration of the
 * statement, so two concurrent confirmations of the last unit in stock cannot both
 * succeed — the second one matches zero rows and is rejected. A read-check followed by
 * a separate write would let both pass and drive stock negative.
 *
 * Must be called inside a transaction so the movement row and the balance change
 * commit together.
 */
export const applyMovement = async (tx: Tx, args: ApplyMovementArgs) => {
  const { productId, quantity, type, reason, referenceType, referenceId, userId } = args;

  if (quantity <= 0) {
    throw ApiError.badRequest('Movement quantity must be greater than zero');
  }

  const rows =
    type === MovementType.OUT
      ? await tx.$queryRaw<Array<{ current_stock: number; name: string; sku: string }>>`
          UPDATE products
             SET current_stock = current_stock - ${quantity}, updated_at = NOW()
           WHERE id = ${productId}
             AND current_stock >= ${quantity}
        RETURNING current_stock, name, sku
        `
      : await tx.$queryRaw<Array<{ current_stock: number; name: string; sku: string }>>`
          UPDATE products
             SET current_stock = current_stock + ${quantity}, updated_at = NOW()
           WHERE id = ${productId}
        RETURNING current_stock, name, sku
        `;

  if (rows.length === 0) {
    // Zero rows means either the product is gone or the stock guard rejected it.
    // Distinguish the two so the client gets an actionable message.
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { name: true, sku: true, currentStock: true },
    });

    if (!product) throw ApiError.notFound(`Product ${productId} not found`);

    throw ApiError.unprocessable(
      `Insufficient stock for ${product.name} (${product.sku}). Available: ${product.currentStock}, requested: ${quantity}.`,
      'INSUFFICIENT_STOCK',
      {
        productId,
        productName: product.name,
        sku: product.sku,
        available: product.currentStock,
        requested: quantity,
      },
    );
  }

  const stockAfter = Number(rows[0].current_stock);

  const movement = await tx.stockMovement.create({
    data: {
      productId,
      quantity,
      type,
      reason,
      referenceType,
      referenceId,
      stockAfter,
      createdById: userId,
    },
  });

  return { movement, stockAfter };
};

export const createManualMovement = async (input: CreateMovementInput, userId: string) =>
  prisma.$transaction(async (tx) => {
    const { movement, stockAfter } = await applyMovement(tx, {
      productId: input.productId,
      quantity: input.quantity,
      type: input.type,
      reason: input.reason,
      referenceType: 'MANUAL_ADJUSTMENT',
      userId,
    });

    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: { id: true, name: true, sku: true, currentStock: true, minStockAlert: true },
    });

    return { ...movement, stockAfter, product };
  });

export const listMovements = async (query: ListMovementsQuery) => {
  const search = cleanSearch(query.search);

  const where: Prisma.StockMovementWhereInput = {
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.type ? { type: query.type } : {}),
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
            { reason: { contains: search, mode: 'insensitive' } },
            { product: { name: { contains: search, mode: 'insensitive' } } },
            { product: { sku: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      ...skipTake(query),
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true, sku: true, location: true } },
        createdBy: { select: { id: true, name: true, role: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return {
    data: movements,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};
