// Edge function: account_deletion_confirmation
//
// Sent right after the user confirms account deletion in the app. The email
// confirms the 30-day grace window and tells them how to cancel (just sign in
// again).
//
// Auth: user JWT.
// Request body: { reasons?: string[] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'missing_authorization' }, { status: 401 });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData } = await userClient.auth.getUser();
  const user = userData.user;
  if (!user) return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  if (!user.email) return jsonResponse({ ok: true, delivered: false, reason: 'no_email_on_account' });

  // Read the scheduled date so the email is accurate.
  const { data: req_ } = await userClient
    .from('deletion_requests')
    .select('scheduled_for')
    .eq('user_id', user.id)
    .maybeSingle();
  const scheduledIso = req_?.scheduled_for ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const scheduledDate = new Date(scheduledIso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const subject = 'Beija — sua conta será apagada em 30 dias';
  const text = [
    'Recebemos sua solicitação pra apagar sua conta no Beija.',
    '',
    `Vamos apagar tudo (perfil, fotos, matches, mensagens) no dia ${scheduledDate}.`,
    '',
    'Mudou de ideia? Basta entrar de novo no app antes dessa data e seu perfil é restaurado.',
    '',
    'Depois desse prazo, a exclusão é definitiva e não pode ser desfeita.',
    '',
    'Se você não pediu isso, escreva pra security@beija.app imediatamente.',
    '',
    '— Equipe Beija',
  ].join('\n');

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1c0a2b;">
  <h1 style="color: #e11d74;">Sua conta será apagada</h1>
  <p>Recebemos sua solicitação pra apagar sua conta no Beija.</p>
  <p>Vamos apagar tudo (perfil, fotos, matches, mensagens) no dia <strong>${scheduledDate}</strong>.</p>
  <p>Mudou de ideia? Basta entrar de novo no app antes dessa data e seu perfil é restaurado.</p>
  <p style="color: #777; font-size: 13px;">Se você não pediu isso, escreva pra <a href="mailto:security@beija.app">security@beija.app</a> imediatamente.</p>
  <p style="margin-top: 32px;">— Equipe Beija</p>
</body>
</html>`;

  const result = await sendEmail({ to: user.email, subject, text, html });
  return jsonResponse({ ok: true, ...result });
});
