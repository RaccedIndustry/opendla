import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

/** Lets a route (or a whole controller) through without a login. */
export const Public = Reflector.createDecorator();

export type AuthRequest = Request & { user: { sub: number; username: string } };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride(Public, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const token = /(?:^|;\s*)token=([^;]*)/.exec(req.headers.cookie ?? '')?.[1];
    try {
      req.user = await this.jwt.verifyAsync(token ?? '');
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }
}
