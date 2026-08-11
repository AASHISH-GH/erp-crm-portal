import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler, created, ok } from '../../lib/http';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { changePasswordSchema, loginSchema, registerSchema } from './auth.schema';
import * as authService from './auth.service';

const router = Router();

router.post(
  '/login',
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    return ok(res, result);
  }),
);

// Account creation is an admin action — there is no public sign-up in an internal portal.
router.post(
  '/register',
  authenticate,
  authorize(Role.ADMIN),
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const user = await authService.register(req.body);
    return created(res, user);
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await authService.getProfile(req.user!.id);
    return ok(res, user);
  }),
);

router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.changePassword(req.user!.id, req.body);
    return ok(res, result);
  }),
);

export default router;
