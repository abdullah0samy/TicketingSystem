import { Controller, Post, Get, Param, Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Inject, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';
import type { Response } from 'express';
import path from 'path';
import fs from 'fs';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';

const ALLOWED_EXTENSIONS = ['.jpeg', '.jpg', '.png', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.wav', '.mp3', '.webm'];
const ALLOWED_MIMETYPES = [
  'image/jpeg', 'image/png',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/wav', 'audio/mpeg', 'audio/webm',
];

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('api/uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly uploadsService: UploadsService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ upload: {} })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File to upload (JPEG, PNG, PDF, DOC, DOCX, XLS, XLSX, WAV, MP3, WEBM)',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ALLOWED_EXTENSIONS.includes(ext) && ALLOWED_MIMETYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new BadRequestException('Invalid file type. Allowed: JPEG, PNG, PDF, DOC, DOCX, XLS, XLSX, WAV, MP3, WEBM'), false);
      }
    },
  }))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    this.uploadsService.validateMagicByte(file.path, file.mimetype);
    const fileUrl = `/uploads/${file.filename}`;
    return { fileName: file.originalname, fileUrl, fileSize: file.size, mimeType: file.mimetype };
  }

  @Get('download/:filename')
  async downloadFile(@Param('filename') filename: string, @Res() res: Response) {
    const { filePath, sanitized } = this.uploadsService.downloadFile(filename);
    res.download(filePath, sanitized);
  }
}
