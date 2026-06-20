import { Controller, Post, Body, Req, Res, HttpCode, Inject } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ login: {} })
  @ApiOperation({ summary: 'Authenticate user with identifier and password' })
  async login(
    @Body() body: { identifier: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(body.identifier, body.password);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ auth: {} })
  async refresh(
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
  ) {
    const token = body.refreshToken || (req.cookies?.refreshToken as string);
    return this.authService.refresh(token);
  }

  @Post('logout')
  @Throttle({ auth: {} })
  @HttpCode(200)
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    return this.authService.logout();
  }
}
