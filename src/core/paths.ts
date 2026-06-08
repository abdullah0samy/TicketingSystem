import path from 'path';

export const PROJECT_ROOT = process.cwd();
export const UPLOADS_DIR = path.join(PROJECT_ROOT, 'uploads');
export const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');
export const EXPORTS_DIR = path.join(UPLOADS_DIR, 'exports');
export const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
