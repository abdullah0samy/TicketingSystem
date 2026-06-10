import { Controller, Get, Put, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Inject } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('api/users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser('id') userId: number) {
    return this.usersService.getMe(userId);
  }

  @Put('profile')
  async updateProfile(
    @CurrentUser('id') userId: number,
    @Body() body: { fullNameAr?: string; fullNameEn?: string; email?: string; langPref?: string },
  ) {
    return this.usersService.updateProfile(userId, body);
  }

  @Put('avatar')
  @UseInterceptors(FileInterceptor('avatar', {
    storage: diskStorage({
      destination: 'uploads/avatars',
      filename: (_req, file, cb) => {
        const uniqueSuffix = uuidv4();
        cb(null, `avatar-${uniqueSuffix}${extname(file.originalname)}`);
      },
    }),
    fileFilter: (_req: any, file: any, cb: any) => {
      const allowedTypes = ['image/jpeg', 'image/png'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new BadRequestException('Invalid file type. Only JPEG and PNG are allowed.'), false);
      }
    },
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  async uploadAvatar(
    @CurrentUser('id') userId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException({ message: 'No file uploaded' });
    }
    return this.usersService.updateAvatar(userId, file);
  }
}
