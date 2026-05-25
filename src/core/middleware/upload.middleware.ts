import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AVATARS_DIR } from '../paths.ts';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, AVATARS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4();
    cb(null, `avatar-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

export const uploadAvatar = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});
