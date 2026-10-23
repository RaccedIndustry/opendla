import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthRequest } from './auth.guard.js';
import { hashPassword } from './auth.service.js';
import { User } from './user.entity.js';

@Controller('users')
export class UsersController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  @Get()
  list() {
    return this.users.find({
      select: { id: true, username: true },
      order: { username: 'ASC' },
    });
  }

  @Post()
  async create(
    @Body() body: { username?: unknown; password?: unknown } | undefined,
  ) {
    const username =
      typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!username || !password) {
      throw new BadRequestException('username and password are required');
    }
    try {
      const { id } = await this.users.save({
        username,
        passwordHash: await hashPassword(password),
      });
      return { id, username };
    } catch (e) {
      if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new ConflictException(`${username} already exists`);
      }
      throw e;
    }
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthRequest) {
    // Also means the last user can never be deleted: it's whoever is logged in.
    if (id === req.user.sub) {
      throw new BadRequestException("You can't delete yourself");
    }
    if (!(await this.users.delete(id)).affected) throw new NotFoundException();
  }
}
