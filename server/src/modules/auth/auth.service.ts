import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/apiError';
import { signToken } from '../../middleware/auth';
import type { ChangePasswordInput, LoginInput, RegisterInput } from './auth.schema';

const SALT_ROUNDS = 10;

const publicUser = (user: {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
});

export const login = async ({ email, password }: LoginInput) => {
  const user = await prisma.user.findUnique({ where: { email } });

  // Same message for "no such user" and "wrong password" so the endpoint cannot be
  // used to enumerate which emails exist.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated. Contact an administrator.');
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  return { token, user: publicUser(user) };
};

export const register = async (input: RegisterInput) => {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw ApiError.conflict('A user with this email already exists');
  }

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await bcrypt.hash(input.password, SALT_ROUNDS),
    },
  });

  return publicUser(user);
};

export const getProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');
  return publicUser(user);
};

export const changePassword = async (userId: string, input: ChangePasswordInput) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(input.newPassword, SALT_ROUNDS) },
  });

  return { message: 'Password updated successfully' };
};
