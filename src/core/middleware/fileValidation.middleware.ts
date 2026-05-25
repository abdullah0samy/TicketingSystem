import { fileTypeFromFile } from 'file-type';
import fs from 'fs/promises';
import path from 'path';

export interface FileValidationRule {
  maxSize: number;
  allowedMimeTypes: string[];
}

export class FileValidationError extends Error {
  public readonly httpStatus: number = 400;
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

const ALLOWED_AVATAR_TYPES: FileValidationRule = {
  maxSize: 2 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

const ALLOWED_UPLOAD_TYPES: FileValidationRule = {
  maxSize: 5 * 1024 * 1024,
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'audio/wav',
    'audio/mpeg',
    'audio/webm',
    'video/webm',
  ],
};

const MIME_TO_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'audio/wav': ['.wav'],
  'audio/mpeg': ['.mp3'],
  'audio/webm': ['.webm'],
  'video/webm': ['.webm'],
  'image/webp': ['.webp'],
};

function getExpectedExtension(mimeType: string): string[] {
  return MIME_TO_EXTENSIONS[mimeType] || [];
}

export async function validateFileMagicBytes(
  filePath: string,
  rules: FileValidationRule,
  originalExtension: string
): Promise<{ mimeType: string; size: number }> {
  const stat = await fs.stat(filePath);
  if (stat.size > rules.maxSize) {
    throw new FileValidationError(
      `File exceeds maximum size of ${rules.maxSize / (1024 * 1024)}MB`
    );
  }

  const type = await fileTypeFromFile(filePath);
  if (!type) {
    throw new FileValidationError('Unable to determine file type from content');
  }

  if (!rules.allowedMimeTypes.includes(type.mime)) {
    throw new FileValidationError(
      `File type '${type.mime}' is not allowed. Allowed types: ${rules.allowedMimeTypes.join(', ')}`
    );
  }

  const expectedExts = getExpectedExtension(type.mime);
  const normalizedExt = originalExtension.toLowerCase();
  if (
    expectedExts.length > 0 &&
    !expectedExts.includes(normalizedExt)
  ) {
    throw new FileValidationError(
      `File extension '${originalExtension}' does not match content type '${type.mime}'`
    );
  }

  return { mimeType: type.mime, size: stat.size };
}

export async function validateUploadedFile(
  filePath: string,
  originalExtension: string
): Promise<{ mimeType: string; size: number }> {
  return validateFileMagicBytes(filePath, ALLOWED_UPLOAD_TYPES, originalExtension);
}

export async function validateAvatarFile(
  filePath: string,
  originalExtension: string
): Promise<{ mimeType: string; size: number }> {
  return validateFileMagicBytes(filePath, ALLOWED_AVATAR_TYPES, originalExtension);
}

export async function safeDeleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // File may have already been deleted
  }
}
