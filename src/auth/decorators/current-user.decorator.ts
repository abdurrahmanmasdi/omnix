import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

// Define the exact shape of the user returned by our JwtStrategy
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  organizationId: string | null;
  roleId: string | null;
}

export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
