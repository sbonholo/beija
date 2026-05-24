import { supabase } from './supabase';
import i18n from '../i18n';

/** Decision returned by the moderate_photo edge function. */
export interface ModerationDecision {
  approved: boolean;
  reasons: string[];
  scores: Record<string, number>;
  unconfigured?: boolean;
  provider_error?: boolean;
}

/** Thrown by uploadProfilePhoto when Sightengine rejects the image. */
export class ModerationError extends Error {
  reasons: string[];
  scores: Record<string, number>;
  constructor(reasons: string[], scores: Record<string, number>) {
    super(`photo_rejected: ${reasons.join(',')}`);
    this.name = 'ModerationError';
    this.reasons = reasons;
    this.scores = scores;
  }
}

/**
 * Strips the `data:image/...;base64,` prefix if present.
 */
function stripBase64Prefix(s: string): string {
  return s.replace(/^data:[^;]+;base64,/, '');
}

/**
 * Pre-upload moderation check. Calls the moderate_photo edge function which
 * proxies to Sightengine, holding the API secret server-side.
 *
 * Fail-OPEN philosophy: if the function returns a network/transport error,
 * we allow the upload to proceed. The server-side photo_moderation_hook
 * (OpenAI) will still pass the file through after upload — defense in depth.
 */
export async function moderatePhotoPreUpload(
  base64: string,
  mimeType: string = 'image/jpeg',
): Promise<ModerationDecision> {
  try {
    const { data, error } = await supabase.functions.invoke<ModerationDecision>(
      'moderate_photo',
      {
        body: {
          photo_base64: stripBase64Prefix(base64),
          mime_type: mimeType,
        },
      },
    );
    if (error || !data) {
      console.warn('[moderation] edge function unreachable; failing open:', error?.message);
      return { approved: true, reasons: [], scores: {}, provider_error: true };
    }
    return data;
  } catch (e) {
    console.warn('[moderation] unexpected error; failing open:', e);
    return { approved: true, reasons: [], scores: {}, provider_error: true };
  }
}

/**
 * Human-friendly PT-BR labels for the `reasons[]` strings returned by the
 * edge function. Mapped 1:1 from the categories evaluate() emits.
 */
export const MODERATION_REASON_LABELS_PT: Record<string, string> = {
  nudity_sexual_activity: 'Nudez ou ato sexual explícito',
  nudity_sexual_display: 'Conteúdo sexual explícito',
  nudity_erotica: 'Conteúdo erótico',
  minor: 'Suspeita de menor de idade na imagem',
  gore: 'Violência gráfica',
  weapon: 'Armas em destaque',
  drug: 'Uso de drogas',
  scam: 'Possível golpe ou fraude',
  offensive_nazi: 'Símbolos nazistas',
  offensive_supremacist: 'Símbolos supremacistas',
  offensive_terrorist: 'Símbolos terroristas',
  offensive_middle_finger: 'Gesto ofensivo',
  offensive_confederate: 'Símbolos confederados',
  offensive_generic: 'Conteúdo ofensivo',
  rate_limited: 'Você tentou enviar fotos demais em pouco tempo. Aguarde um minuto.',
  provider_error: 'Não conseguimos validar a foto agora. Tente de novo.',
};

export function labelReason(reason: string): string {
  // Prefer the i18n catalog (moderation.reasons.<key>) and fall back to the
  // hardcoded PT-BR map if a key is missing from the catalog (defensive).
  const key = `moderation:reasons.${reason}`;
  const translated = i18n.t(key);
  if (typeof translated === 'string' && translated !== key) return translated;
  return MODERATION_REASON_LABELS_PT[reason] ?? reason;
}
