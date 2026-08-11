import { Router } from 'express';
import { ChallanStatus, CustomerStatus } from '@prisma/client';
import { asyncHandler, ok } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const [
      totalCustomers,
      activeCustomers,
      leads,
      totalProducts,
      lowStockProducts,
      draftChallans,
      confirmedChallans,
      cancelledChallans,
      dueFollowUps,
      confirmedToday,
      recentMovements,
      recentChallans,
      stockValueRows,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { status: CustomerStatus.ACTIVE } }),
      prisma.customer.count({ where: { status: CustomerStatus.LEAD } }),
      prisma.product.count(),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM products WHERE current_stock <= min_stock_alert
      `,
      prisma.challan.count({ where: { status: ChallanStatus.DRAFT } }),
      prisma.challan.count({ where: { status: ChallanStatus.CONFIRMED } }),
      prisma.challan.count({ where: { status: ChallanStatus.CANCELLED } }),
      prisma.customer.count({ where: { followUpDate: { lte: endOfToday } } }),
      prisma.challan.aggregate({
        where: { status: ChallanStatus.CONFIRMED, confirmedAt: { gte: startOfToday } },
        _sum: { totalAmount: true, totalQuantity: true },
        _count: true,
      }),
      prisma.stockMovement.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          createdBy: { select: { id: true, name: true } },
        },
      }),
      prisma.challan.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          challanNumber: true,
          customerName: true,
          status: true,
          totalQuantity: true,
          totalAmount: true,
          createdAt: true,
        },
      }),
      prisma.$queryRaw<Array<{ value: string | null }>>`
        SELECT SUM(current_stock * unit_price)::text AS value FROM products WHERE is_active = true
      `,
    ]);

    // Low-stock list for the alert panel, ordered by how far below the line they are.
    const lowStockList = await prisma.$queryRaw<
      Array<{ id: string; name: string; sku: string; current_stock: number; min_stock_alert: number }>
    >`
      SELECT id, name, sku, current_stock, min_stock_alert
        FROM products
       WHERE current_stock <= min_stock_alert AND is_active = true
       ORDER BY (current_stock - min_stock_alert) ASC
       LIMIT 8
    `;

    return ok(res, {
      customers: { total: totalCustomers, active: activeCustomers, leads, dueFollowUps },
      products: {
        total: totalProducts,
        lowStock: Number(lowStockProducts[0]?.count ?? 0),
        stockValue: Number(stockValueRows[0]?.value ?? 0),
      },
      challans: {
        draft: draftChallans,
        confirmed: confirmedChallans,
        cancelled: cancelledChallans,
        total: draftChallans + confirmedChallans + cancelledChallans,
      },
      today: {
        confirmedChallans: confirmedToday._count,
        quantityDispatched: confirmedToday._sum.totalQuantity ?? 0,
        amount: Number(confirmedToday._sum.totalAmount ?? 0),
      },
      lowStockList: lowStockList.map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        currentStock: Number(row.current_stock),
        minStockAlert: Number(row.min_stock_alert),
      })),
      recentMovements,
      recentChallans,
    });
  }),
);

export default router;
