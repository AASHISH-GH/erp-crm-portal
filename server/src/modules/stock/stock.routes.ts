import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler, created, ok } from '../../lib/http';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createMovementSchema,
  listMovementsSchema,
  type ListMovementsQuery,
} from './stock.schema';
import * as stockService from './stock.service';

const router = Router();

router.use(authenticate);

// The ledger is readable by every role — accounts and sales both need to explain
// where stock went — but only the warehouse (and admin) may move it.
router.get(
  '/movements',
  validate({ query: listMovementsSchema }),
  asyncHandler(async (req, res) => {
    const { data, meta } = await stockService.listMovements(
      req.query as unknown as ListMovementsQuery,
    );
    return ok(res, data, meta);
  }),
);

router.post(
  '/movements',
  authorize(Role.ADMIN, Role.WAREHOUSE),
  validate({ body: createMovementSchema }),
  asyncHandler(async (req, res) => {
    const movement = await stockService.createManualMovement(req.body, req.user!.id);
    return created(res, movement);
  }),
);

export default router;
