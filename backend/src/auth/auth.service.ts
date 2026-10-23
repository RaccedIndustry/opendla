import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

export const SESSION_SECONDS = 7 * 24 * 60 * 60;

const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt)).toString('hex')}`;
}

async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(
    await derive(password, salt),
    Buffer.from(hash, 'hex'),
  );
}

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async onApplicationBootstrap() {
    if (await this.users.count()) return;
    await this.users.insert({
      username: 'admin',
      passwordHash: await hashPassword('admin'),
    });
    this.logger.warn('Created default login admin/admin');
  }

  async login(username: string, password: string) {
    const user = await this.users.findOneBy({ username });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException();
    }
    return this.jwt.signAsync(
      { sub: user.id, username: user.username },
      { expiresIn: SESSION_SECONDS },
    );
  }
}
