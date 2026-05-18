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

const fileFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG and WEBP are allowed.'), false);
  }
};

export const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});
