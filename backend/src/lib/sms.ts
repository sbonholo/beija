import { config } from '../config.js';

export async function sendSms(phone: string, message: string): Promise<void> {
  void message; // never log message — it contains the OTP code
  const redacted = phone.slice(0, 4) + '****' + phone.slice(-2);
  if (config.smsProvider === 'mock') {
    console.log(`[SMS:mock] sent to ${redacted}`);
    return;
  }
  console.warn(`[SMS] provider "${config.smsProvider}" not implemented, sent to ${redacted}`);
}
