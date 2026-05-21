import 'dotenv/config';
import path from 'path';
import fs from 'fs';

const root = path.resolve(process.cwd());

function resolvePath(p: string) {
  return path.isAbsolute(p) ? p : path.join(root, p);
}

const dataDir = process.env.DATA_DIR || '';

const databaseFile = dataDir
  ? path.join(dataDir, 'beija.db')
  : resolvePath(process.env.DATABASE_FILE || './data/beija.db');

const uploadDir = dataDir
  ? path.join(dataDir, 'uploads')
  : resolvePath(process.env.UPLOAD_DIR || './uploads');

const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
const publicUrl =
  process.env.PUBLIC_URL ||
  (railwayDomain ? `https://${railwayDomain}` : 'http://localhost:4000');

const explicitOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (process.env.FRONTEND_URL) explicitOrigins.push(process.env.FRONTEND_URL);

const isProd = process.env.NODE_ENV === 'production';
if (!isProd) {
  if (!explicitOrigins.includes('http://localhost:5173')) explicitOrigins.push('http://localhost:5173');
  if (!explicitOrigins.includes('http://localhost:4173')) explicitOrigins.push('http://localhost:4173');
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'beija-dev-secret-change-me',
  otpTtlSeconds: parseInt(process.env.OTP_TTL_SECONDS || '300', 10),
  devReturnOtp: (process.env.DEV_RETURN_OTP || (isProd ? 'false' : 'true')) === 'true',
  databaseFile,
  uploadDir,
  publicUrl,
  corsOrigins: explicitOrigins,
  smsProvider: process.env.SMS_PROVIDER || 'mock',
  isProd,
};

fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });
