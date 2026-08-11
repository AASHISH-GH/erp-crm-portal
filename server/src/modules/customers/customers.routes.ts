import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler, created, ok } from '../../lib/http';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createCustomerSchema,
  createFollowUpSchema,
  customerIdParamSchema,
  listCustomersSchema,
  updateCustomerSchema,
  type ListCustomersQuery,
} from './customers.schema';
import * as customersService from './customers.service';

const router = Router();

// Everyone signed in can read the customer book; only sales/admin may change it.
const CAN_WRITE = [Role.ADMIN, Role.SALES] as const;

router.use(authenticate);

router.get(
  '/',
  validate({ query: listCustomersSchema }),
  asyncHandler(async (req, res) => {
    const { data, meta } = await customersService.listCustomers(
      req.query as unknown as ListCustomersQuery,
    );
    return ok(res, data, meta);
  }),
);

router.get(
  '/:id',
  validate({ params: customerIdParamSchema }),
  asyncHandler(async (req, res) => {
    const customer = await customersService.getCustomerById(req.params.id);
    return ok(res, customer);
  }),
);

router.post(
  '/',
  authorize(...CAN_WRITE),
  validate({ body: createCustomerSchema }),
  asyncHandler(async (req, res) => {
    const customer = await customersService.createCustomer(req.body, req.user!.id);
    return created(res, customer);
  }),
);

router.put(
  '/:id',
  authorize(...CAN_WRITE),
  validate({ params: customerIdParamSchema, body: updateCustomerSchema }),
  asyncHandler(async (req, res) => {
    const customer = await customersService.updateCustomer(req.params.id, req.body);
    return ok(res, customer);
  }),
);

router.delete(
  '/:id',
  authorize(Role.ADMIN),
  validate({ params: customerIdParamSchema }),
  asyncHandler(async (req, res) => {
    const result = await customersService.deleteCustomer(req.params.id);
    return ok(res, result);
  }),
);

router.get(
  '/:id/follow-ups',
  validate({ params: customerIdParamSchema }),
  asyncHandler(async (req, res) => {
    const followUps = await customersService.listFollowUps(req.params.id);
    return ok(res, followUps);
  }),
);

router.post(
  '/:id/follow-ups',
  authorize(...CAN_WRITE),
  validate({ params: customerIdParamSchema, body: createFollowUpSchema }),
  asyncHandler(async (req, res) => {
    const followUp = await customersService.addFollowUp(req.params.id, req.body, req.user!.id);
    return created(res, followUp);
  }),
);

export default router;
