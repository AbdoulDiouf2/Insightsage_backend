import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
    Strategy,
    'jwt-refresh',
) {
    constructor(
        private configService: ConfigService,
        private usersService: UsersService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_REFRESH_SECRET') || 'defaultRefreshSecret',
            passReqToCallback: true,
        });
    }

    async validate(req: Request, payload: { sub: string; email: string }) {
        const refreshToken = req.get('Authorization')?.replace('Bearer', '').trim();
        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token malformed');
        }
        const user = await this.usersService.findById(payload.sub);
        if (!user) {
            throw new UnauthorizedException();
        }
        return { ...user, refreshToken };
    }
}
