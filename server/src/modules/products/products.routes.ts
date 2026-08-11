import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler, created, ok } from '../../lib/http';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createProductSchema,
  listProductsSchema,
  productIdParamSchema,
  updateProductSchema,
  type ListProductsQuery,
} from './products.schema';
import * as productsService from './products.service';

const router = Router();

// The warehouse owns the product master; sales and accounts read it.
const CAN_WRITE = [Role.ADMIN, Role.WAREHOUSE] as const;

router.use(authenticate);

router.get(
  '/',
  validate({ query: listProductsSchema }),
  asyncHandler(async (req, res) => {
    const { data, meta } = await productsService.listProducts(
      req.query as unknown as ListProductsQuery,
    );
    return ok(res, data, meta);
  }),
);

router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await productsService.listCategories();
    return ok(res, categories);
  }),
);

router.get(
  '/:id',
  validate({ params: productIdParamSchema }),
  asyncHandler(async (req, res) => {
    const product = await productsService.getProductById(req.params.id);
    return ok(res, product);
  }),
);

router.post(
  '/',
  authorize(...CAN_WRITE),
  validate({ body: createProductSchema }),
  asyncHandler(async (req, res) => {
    const product = await productsService.createProduct(req.body, req.user!.id);
    return created(res, product);
  }),
);

router.put(
  '/:id',
  authorize(...CAN_WRITE),
  validate({ params: productIdParamSchema, body: updateProductSchema }),
  asyncHandler(async (req, res) => {
    const product = await productsService.updateProduct(req.params.id, req.body);
    return ok(res, product);
  }),
);

router.delete(
  '/:id',
  authorize(Role.ADMIN),
  validate({ params: productIdParamSchema }),
  asyncHandler(async (req, res) => {
    const result = await productsService.deleteProduct(req.params.id);
    return ok(res, result);
  }),
);

export default router;
