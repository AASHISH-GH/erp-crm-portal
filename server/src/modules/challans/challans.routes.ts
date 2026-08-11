import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler, created, ok } from '../../lib/http';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/apiError';
import {
  cancelChallanSchema,
  challanIdParamSchema,
  createChallanSchema,
  listChallansSchema,
  updateChallanSchema,
  type ListChallansQuery,
} from './challans.schema';
import * as challansService from './challans.service';
import { streamChallanPdf } from './challans.pdf';

const router = Router();

// Sales raise challans; the warehouse confirms/cancels them because it is the team
// that physically moves the goods. Admin can do both.
const CAN_CREATE = [Role.ADMIN, Role.SALES] as const;
const CAN_DISPATCH = [Role.ADMIN, Role.SALES, Role.WAREHOUSE] as const;

router.use(authenticate);

router.get(
  '/',
  validate({ query: listChallansSchema }),
  asyncHandler(async (req, res) => {
    const { data, meta } = await challansService.listChallans(
      req.query as unknown as ListChallansQuery,
    );
    return ok(res, data, meta);
  }),
);

router.get(
  '/:id',
  validate({ params: challanIdParamSchema }),
  asyncHandler(async (req, res) => {
    const challan = await challansService.getChallanById(req.params.id);
    return ok(res, challan);
  }),
);

// Bonus: invoice/challan PDF export, streamed rather than stored.
router.get(
  '/:id/pdf',
  validate({ params: challanIdParamSchema }),
  asyncHandler(async (req, res) => {
    const challan = await prisma.challan.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!challan) throw ApiError.notFound('Challan not found');
    streamChallanPdf(challan, res);
  }),
);

router.post(
  '/',
  authorize(...CAN_CREATE),
  validate({ body: createChallanSchema }),
  asyncHandler(async (req, res) => {
    const challan = await challansService.createChallan(req.body, req.user!.id);
    return created(res, challan);
  }),
);

router.put(
  '/:id',
  authorize(...CAN_CREATE),
  validate({ params: challanIdParamSchema, body: updateChallanSchema }),
  asyncHandler(async (req, res) => {
    const challan = await challansService.updateChallan(req.params.id, req.body);
    return ok(res, challan);
  }),
);

router.post(
  '/:id/confirm',
  authorize(...CAN_DISPATCH),
  validate({ params: challanIdParamSchema }),
  asyncHandler(async (req, res) => {
    const challan = await challansService.confirmChallan(req.params.id, req.user!.id);
    return ok(res, challan);
  }),
);

router.post(
  '/:id/cancel',
  authorize(...CAN_DISPATCH),
  validate({ params: challanIdParamSchema, body: cancelChallanSchema }),
  asyncHandler(async (req, res) => {
    const challan = await challansService.cancelChallan(
      req.params.id,
      req.body.reason,
      req.user!.id,
    );
    return ok(res, challan);
  }),
);

router.delete(
  '/:id',
  authorize(Role.ADMIN),
  validate({ params: challanIdParamSchema }),
  asyncHandler(async (req, res) => {
    const result = await challansService.deleteChallan(req.params.id);
    return ok(res, result);
  }),
);

export default router;
