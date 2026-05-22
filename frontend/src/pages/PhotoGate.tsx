import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockedApi as api } from '../lib/api';
import { useAuth } from '../state/AuthContext';

export function PhotoGate() {
  const nav = useNavigate();
  const { user, setUser } = useAuth();
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  }

  function reset() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
  }

  async function confirm() {
    if (!file || !user) return;
    setUploading(true);
    setError(null);
    try {
      const { photoUrl } = await api.uploadPhoto(file);
      const { user: updated } = await api.updateMe({ photoUrl });
      setUser(updated);
      nav('/events', { replace: true });
    } catch {
      setError('Erro ao enviar foto.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '40px 24px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ marginBottom: 28 }}>
        <h1 className="brand-title">Beija</h1>
      </div>

      <h2 style={{ margin: '0 0 6px' }}>Adicione sua foto</h2>
      <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>
        Você precisa de uma foto para entrar nos rolês 📸
      </p>

      {preview ? (
        <>
          <div
            style={{
              width: '100%',
              aspectRatio: '1 / 1',
              borderRadius: 'var(--radius)',
              backgroundImage: `url("${preview}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              marginBottom: 18,
              boxShadow: 'var(--shadow)',
            }}
          />
          <button className="btn" disabled={uploading} onClick={confirm}>
            {uploading ? 'Enviando...' : 'Usar esta foto'}
          </button>
          <button
            className="btn ghost"
            style={{ marginTop: 12 }}
            disabled={uploading}
            onClick={reset}
          >
            Trocar foto
          </button>
        </>
      ) : (
        <>
          <button className="btn" onClick={() => cameraRef.current?.click()}>
            📷 Tirar selfie
          </button>
          <button
            className="btn ghost"
            style={{ marginTop: 12 }}
            onClick={() => galleryRef.current?.click()}
          >
            🖼️ Escolher da galeria
          </button>
        </>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="user"
        style={{ display: 'none' }}
        onChange={onPick}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onPick}
      />

      {error && (
        <p style={{ color: 'var(--danger)', marginTop: 14, fontSize: 14 }}>{error}</p>
      )}
    </div>
  );
}
