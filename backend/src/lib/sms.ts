import { config } from '../config.js';

function redact(phone: string): string {
  return phone.slice(0, 4) + '****' + phone.slice(-2);
}

async function sendViaTwilio(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) throw new Error('Twilio credentials not set (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)');

  const isWhatsApp = config.smsProvider === 'twilio-whatsapp';
  const params = new URLSearchParams({
    To: isWhatsApp ? `whatsapp:${to}` : to,
    From: isWhatsApp ? `whatsapp:${from}` : from,
    Body: body,
  });
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Twilio ${resp.status}: ${text.slice(0, 200)}`);
  }
}

async function sendViaZenvia(to: string, body: string): Promise<void> {
  const token = process.env.ZENVIA_TOKEN;
  const from = process.env.ZENVIA_FROM;
  if (!token || !from) throw new Error('Zenvia credentials not set (ZENVIA_TOKEN, ZENVIA_FROM)');

  const channel = config.smsProvider === 'zenvia-whatsapp' ? 'whatsapp' : 'sms';
  const resp = await fetch(`https://api.zenvia.com/v2/channels/${channel}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Token': token },
    body: JSON.stringify({ from, to, contents: [{ type: 'text', text: body }] }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Zenvia ${resp.status}: ${text.slice(0, 200)}`);
  }
}

export async function sendSms(phone: string, message: string): Promise<void> {
  const tag = redact(phone);
  switch (config.smsProvider) {
    case 'mock':
      // Safe to log OTP in mock/dev mode since no real users
      console.log(`[SMS:mock] to ${tag}: ${message}`);
      return;
    case 'twilio-sms':
    case 'twilio-whatsapp':
      console.log(`[SMS:twilio] sending to ${tag}`);
      await sendViaTwilio(phone, message);
      return;
    case 'zenvia-sms':
    case 'zenvia-whatsapp':
      console.log(`[SMS:zenvia] sending to ${tag}`);
      await sendViaZenvia(phone, message);
      return;
    default:
      console.warn(`[SMS] unknown provider "${config.smsProvider}", to ${tag}`);
  }
}
