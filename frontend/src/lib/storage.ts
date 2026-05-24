import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { supabase } from './supabase';

const BUCKET = 'profile-photos';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 1080;
const MIN_DIMENSION = 400;
const MAX_SLOTS = 6;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

type AllowedMime = (typeof ALLOWED_MIMES)[number];

export interface PhotoSlot {
  slot: number;
  publicUrl: string | null;
}

/**
 * Opens the Capacitor camera picker (prompt: camera or gallery).
 * Returns the photo as a base64-encoded string, or null on cancel/error.
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
  } catch {
    return null;
  }
}

/**
 * Upload a profile photo for a given user into the requested slot (0..5).
 * Validates format, size, minimum dimensions, and resizes if the longest
 * edge exceeds 1080px. Throws on validation failure.
 */
export async function uploadProfilePhoto(
  userId: string,
  base64: string,
  slot: number,
): Promise<{ publicUrl: string }> {
  if (slot < 0 || slot >= MAX_SLOTS) {
    throw new Error('invalid_slot');
  }
  if (!userId) throw new Error('missing_user_id');
  if (!base64) throw new Error('missing_image_data');

  const mime = inferMimeFromBase64(base64);
  if (!ALLOWED_MIMES.includes(mime)) {
    throw new Error('invalid_format');
  }

  let blob = base64ToBlob(base64, mime);
  if (blob.size > MAX_BYTES) {
    throw new Error('file_too_large');
  }

  blob = await validateAndResize(blob);

  const path = `${userId}/${slot}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl };
}

/** Remove a photo from a user's slot. */
export async function deletePhoto(userId: string, slot: number): Promise<void> {
  if (slot < 0 || slot >= MAX_SLOTS) throw new Error('invalid_slot');
  const path = `${userId}/${slot}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

/** Returns the 6 photo slots for a user, with publicUrl set when the slot is filled. */
export async function listUserPhotos(userId: string): Promise<PhotoSlot[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(userId);
  if (error) throw error;
  const taken = new Set((data ?? []).map((f) => f.name));
  const slots: PhotoSlot[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const filename = `${i}.jpg`;
    if (taken.has(filename)) {
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(`${userId}/${filename}`);
      slots.push({ slot: i, publicUrl: urlData.publicUrl });
    } else {
      slots.push({ slot: i, publicUrl: null });
    }
  }
  return slots;
}

// --- internals ---

function inferMimeFromBase64(base64: string): AllowedMime {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

function base64ToBlob(base64: string, mime: string): Blob {
  const byteString = atob(base64);
  const arr = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) arr[i] = byteString.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function validateAndResize(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const { naturalWidth: width, naturalHeight: height } = img;
    if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
      throw new Error('image_too_small');
    }
    const longest = Math.max(width, height);
    if (longest <= MAX_DIMENSION) return blob;
    const scale = MAX_DIMENSION / longest;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('resize_failed'))),
        'image/jpeg',
        0.85,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_load_failed'));
    img.src = src;
  });
}
