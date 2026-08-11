import { MovementType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/apiError';
import { cleanSearch, skipTake } from '../../lib/pagination';
import { buildPaginationMeta } from '../../lib/http';
import type { CreateProductInput, ListProductsQuery, UpdateProductInput } from './products.schema';

export const listProducts = async (query: ListProductsQuery) => {
  const search = cleanSearch(query.search);

  const where: Prisma.ProductWhereInput = {
    ...(query.category ? { category: { equals: query.category, mode: 'insensitive' } } : {}),
    ...(query.location ? { location: { equals: query.location, mode: 'insensitive' } } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  // "Low stock" is a column-to-column comparison (current_stock <= min_stock_alert),
  // which Prisma's filter syntax cannot express, so it is applied via a raw sub-filter.
  if (query.lowStock) {
    const lowStockIds = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM products WHERE current_stock <= min_stock_alert
    `;
    where.id = { in: lowStockIds.map((row) => row.id) };
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      ...skipTake(query),
      orderBy: { [query.sortBy]: query.sortOrder },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    data: products.map((product) => ({
      ...product,
      isLowStock: product.currentStock <= product.minStockAlert,
    })),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

export const getProductById = async (id: string) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      movements: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { createdBy: { select: { id: true, name: true, role: true } } },
      },
    },
  });

  if (!product) throw ApiError.notFound('Product not found');

  return { ...product, isLowStock: product.currentStock <= product.minStockAlert };
};

export const createProduct = async (input: CreateProductInput, userId: string) => {
  const existing = await prisma.product.findUnique({ where: { sku: input.sku } });
  if (existing) throw ApiError.conflict(`A product with SKU ${input.sku} already exists`);

  // Opening stock is recorded as an IN movement so the ledger explains the full history
  // of the product from the moment it entered the system.
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data: input });

    if (input.currentStock > 0) {
      await tx.stockMovement.create({
        data: {
          productId: product.id,
          quantity: input.currentStock,
          type: MovementType.IN,
          reason: 'Opening stock',
          referenceType: 'PRODUCT_CREATE',
          referenceId: product.id,
          stockAfter: input.currentStock,
          createdById: userId,
        },
      });
    }

    return product;
  });
};

export const updateProduct = async (id: string, input: UpdateProductInput) => {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Product not found');

  if (input.sku && input.sku !== existing.sku) {
    const duplicate = await prisma.product.findFirst({ where: { sku: input.sku, NOT: { id } } });
    if (duplicate) throw ApiError.conflict(`Another product already uses SKU ${input.sku}`);
  }

  return prisma.product.update({ where: { id }, data: input });
};

export const deleteProduct = async (id: string) => {
  const usageCount = await prisma.challanItem.count({ where: { productId: id } });
  if (usageCount > 0) {
    throw ApiError.conflict(
      `Cannot delete a product used on ${usageCount} challan line(s). Deactivate it instead.`,
    );
  }

  await prisma.product.delete({ where: { id } });
  return { message: 'Product deleted successfully' };
};

export const listCategories = async () => {
  const rows = await prisma.product.findMany({
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  });
  return rows.map((row) => row.category);
};
