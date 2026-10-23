import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { Public, type AuthRequest } from './auth.guard.js';
import { AuthService, SESSION_SECONDS } from './auth.service.js';

// ponytail: req.secure is false behind a TLS-terminating proxy; add app.set('trust proxy', 1) there so the cookie gets Secure
const cookieOptions = (req: Request): CookieOptions => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: req.secure,
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(204)
  async login(
    @Body() body: { username?: unknown; password?: unknown } | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (
      typeof body?.username !== 'string' ||
      typeof body?.password !== 'string'
    ) {
      throw new BadRequestException('username and password are required');
    }
    const token = await this.auth.login(body.username, body.password);
    res.cookie('token', token, {
      ...cookieOptions(req),
      maxAge: SESSION_SECONDS * 1000,
    });
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie('token', cookieOptions(req));
  }

  @Get('me')
  me(@Req() req: AuthRequest) {
    return { id: req.user.sub, username: req.user.username };
  }
}
