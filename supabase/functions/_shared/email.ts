// Email helper using Resend (https://resend.com).
//
// Required env vars:
//   RESEND_API_KEY   — from Resend dashboard → API Keys
//   RESEND_FROM      — verified sender, e.g. "Beija <noreply@beija.app>" or
//                      "Beija <onboarding@resend.dev>" in dev mode
//
// If unset, logs the email payload and returns { delivered: false }.

interface SendEmailArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface SendEmailResult {
  delivered: boolean;
  reason?: string;
  status?: number;
  id?: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM') ?? 'Beija <onboarding@resend.dev>';

  if (!apiKey) {
    console.log(
      `[email] RESEND_API_KEY not configured; would have sent to ${args.to}:`,
      args.subject,
    );
    return { delivered: false, reason: 'email_not_configured' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      text: args.text,
      html: args.html,
    }),
  });

  if (!res.ok) {
    return { delivered: false, status: res.status, reason: await res.text() };
  }
  const json = (await res.json()) as { id?: string };
  return { delivered: true, status: res.status, id: json.id };
}
