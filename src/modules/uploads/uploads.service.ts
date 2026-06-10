import { Injectable, BadRequestException, UnprocessableEntityException, NotFoundException } from '@nestjs/common';
import { UPLOADS_DIR } from '../../core/paths';
import path from 'path';
import fs from 'fs';

const MAGIC_BYTES: Record<string, (buf: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47,
  'application/pdf': (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  'application/msword': (b) => b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) => b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04,
  'application/vnd.ms-excel': (b) => b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (b) => b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04,
  'audio/wav': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46,
  'audio/mpeg': (b) => (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0),
  'audio/webm': (b) => b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3,
};

@Injectable()
export class UploadsService {
  validateMagicByte(filePath: string, mimeType: string): void {
    const validator = MAGIC_BYTES[mimeType];
    if (validator) {
      const buf = Buffer.alloc(8);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buf, 0, 8, 0);
      fs.closeSync(fd);
      if (!validator(buf)) {
        fs.unlinkSync(filePath);
        throw new UnprocessableEntityException('File content does not match declared MIME type');
      }
    }
  }

  downloadFile(filename: string): { filePath: string; sanitized: string } {
    const sanitized = path.basename(filename);
    const filePath = path.resolve(UPLOADS_DIR, 'uploads', sanitized);
    const uploadsRoot = path.resolve(UPLOADS_DIR, 'uploads');

    if (!filePath.startsWith(uploadsRoot + path.sep) && filePath !== uploadsRoot) {
      throw new BadRequestException('Invalid filename');
    }

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    return { filePath, sanitized };
  }
}
