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

const DEFAULT_JWT_SECRET = 'beija-dev-secret-change-me';

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  otpTtlSeconds: parseInt(process.env.OTP_TTL_SECONDS || '300', 10),
  devReturnOtp: (process.env.DEV_RETURN_OTP || (isProd ? 'false' : 'true')) === 'true',
  databaseFile,
  uploadDir,
  publicUrl,
  corsOrigins: explicitOrigins,
  whatsappProvider: process.env.WHATSAPP_PROVIDER || 'mock',
  isProd,
  // Event sync (Ticketmaster / Eventbrite)
  ticketmasterApiKey: process.env.TICKETMASTER_API_KEY || '',
  eventbriteToken: process.env.EVENTBRITE_TOKEN || '',
  syncLat: parseFloat(process.env.SYNC_LAT || '-23.5505'),   // default: São Paulo
  syncLng: parseFloat(process.env.SYNC_LNG || '-46.6333'),
  syncRadiusKm: parseInt(process.env.SYNC_RADIUS_KM || '100', 10),
  disableEventSync: process.env.DISABLE_EVENT_SYNC === 'true',
};

if (config.isProd && config.jwtSecret === DEFAULT_JWT_SECRET) {
  throw new Error('[beija] JWT_SECRET must be set in production. Refusing to start with default secret.');
}

fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });
