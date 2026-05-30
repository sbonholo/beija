import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { supabase } from './supabase';
import { ModerationError, moderatePhotoPreUpload } from './moderation';
import { track } from './analytics';

const BUCKET = 'profile-photos';
const MAX_BYTES = 2 * 1024 * 1024;   // 2 MB target after compression
const MAX_INPUT_BYTES = 30 * 1024 * 1024; // 30 MB hard ceiling on input — anything larger is almost certainly not a real phone photo
const MAX_DIMENSION = 1080;
const MIN_DIMENSION = 400;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

type AllowedMime = (typeof ALLOWED_MIMES)[number];

function photoPath(userId: string, slot: 0 | 1): string {
  return `${userId}/photo_${slot}.jpg`;
}

/**
 * Opens the photo picker (prompt: camera or gallery). On native this is the
 * Capacitor Camera action sheet; on web it's backed by @ionic/pwa-elements
 * (registered in main.tsx), which offers both camera capture and file upload.
 * Returns the photo as a base64-encoded string, or null on cancel.
 */
export async function pickPhoto(): Promise<string | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Prompt,
    });
    return photo.base64String ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
    if (msg.includes('cancel')) return null;
    throw e;
  }
}

/**
 * Upload (or replace) a profile photo for the given slot (0 = primary,
 * 1 = secondary). Writes to <userId>/photo_N.jpg with upsert: true.
 */
export async function uploadProfilePhoto(
  userId: string,
  base64: string,
  slot: 0 | 1 = 0,
): Promise<{ publicUrl: string }> {
  if (!userId) throw new Error('missing_user_id');
  if (!base64) throw new Error('missing_image_data');

  const mime = inferMimeFromBase64(base64);
  if (!ALLOWED_MIMES.includes(mime)) {
    throw new Error('invalid_format');
  }

  let blob = base64ToBlob(base64, mime);
  // Sanity guard only — real phone photos top out around 20 MB. Don't reject
  // anything in the normal range; resizeAndCompress below scales everything
  // down to MAX_DIMENSION and re-encodes under MAX_BYTES.
  if (blob.size > MAX_INPUT_BYTES) {
    throw new Error('file_too_large');
  }

  blob = await resizeAndCompress(blob);
  track('photo_upload_attempted');

  // Pre-upload moderation (Apple Guideline 1.2). Fails OPEN on provider
  // errors — server-side photo_moderation_hook is the backstop.
  const resizedBase64 = await blobToBase64(blob);
  const decision = await moderatePhotoPreUpload(resizedBase64, blob.type);
  if (!decision.approved) {
    track('photo_upload_blocked', { reasons: decision.reasons });
    throw new ModerationError(decision.reasons, decision.scores);
  }

  const path = photoPath(userId, slot);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type });
  if (error) throw error;
  track('photo_upload_success');

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl };
}

/** Remove a specific photo slot from storage. */
export async function deletePhoto(userId: string, slot: 0 | 1 = 0): Promise<void> {
  if (!userId) throw new Error('missing_user_id');
  const { error } = await supabase.storage.from(BUCKET).remove([photoPath(userId, slot)]);
  if (error) throw error;
}

/** Returns the public URL for a single slot, or null if not in storage. */
export async function getUserPhoto(
  userId: string,
  slot: 0 | 1 = 0,
): Promise<{ publicUrl: string | null }> {
  const { data, error } = await supabase.storage.from(BUCKET).list(userId);
  if (error) throw error;
  const filename = `photo_${slot}.jpg`;
  const has = (data ?? []).some((f) => f.name === filename)
    // legacy: existing users may still have avatar.jpg until they re-upload
    || (slot === 0 && (data ?? []).some((f) => f.name === 'avatar.jpg'));
  if (!has) return { publicUrl: null };
  const legacyPath = `${userId}/avatar.jpg`;
  const newPath = photoPath(userId, slot);
  const actualPath = (data ?? []).some((f) => f.name === filename) ? newPath : legacyPath;
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(actualPath);
  return { publicUrl: urlData.publicUrl };
}

// --- internals ---

function inferMimeFromBase64(base64: string): AllowedMime {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') return reject(new Error('read_failed'));
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mime: string): Blob {
  const byteString = atob(base64);
  const arr = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) arr[i] = byteString.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function resizeAndCompress(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const { naturalWidth: width, naturalHeight: height } = img;
    if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
      throw new Error('image_too_small');
    }
    const longest = Math.max(width, height);
    const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0, w, h);

    // Iteratively step quality down until we're under MAX_BYTES. Always
    // re-encodes (even when no resize happened) so HEIC/PNG inputs end up
    // as JPEG and the upload path is uniform.
    for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
      const out = await canvasToBlob(canvas, 'image/jpeg', q);
      if (out.size <= MAX_BYTES) return out;
    }
    // Last resort — return the smallest we produced rather than throwing,
    // so we never block the user on a slightly-oversized photo.
    return await canvasToBlob(canvas, 'image/jpeg', 0.4);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), mime, quality),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_load_failed'));
    img.src = src;
  });
}
