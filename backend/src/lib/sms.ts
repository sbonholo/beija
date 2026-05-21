import { config } from '../config.js';

export async function sendSms(phone: string, message: string): Promise<void> {
  if (config.smsProvider === 'mock') {
    console.log(`[SMS:mock] to=${phone} body="${message}"`);
    return;
  }
  console.warn(`[SMS] provider "${config.smsProvider}" not implemented, falling back to log`);
  console.log(`[SMS] to=${phone} body="${message}"`);
}
