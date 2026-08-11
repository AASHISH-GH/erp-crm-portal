import { Router } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler, buildPaginationMeta, ok } from '../../lib/http';
import { cleanSearch, paginationSchema, skipTake } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/apiError';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

const listQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid('Invalid user id') });

const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: z.boolean().optional(),
});

router.use(authenticate, authorize(Role.ADMIN));

router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listQuerySchema>;
    const search = cleanSearch(query.search);

    const where = {
      ...(query.role ? { role: query.role } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        ...skipTake(query),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return ok(res, users, buildPaginationMeta(query.page, query.limit, total));
  }),
);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUserSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Guard against an admin locking themselves out of their own portal.
    if (id === req.user!.id && req.body.isActive === false) {
      throw ApiError.badRequest('You cannot deactivate your own account');
    }
    if (id === req.user!.id && req.body.role && req.body.role !== Role.ADMIN) {
      throw ApiError.badRequest('You cannot remove your own admin role');
    }

    const user = await prisma.user.update({
      where: { id },
      data: req.body,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return ok(res, user);
  }),
);

export default router;
