import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, type Event, type EventCategory } from '../../lib/supabase';

const CATEGORIES: EventCategory[] = ['festival', 'concert', 'bar', 'nightclub', 'show', 'other'];

interface Props {
  event: Event | null;
  onClose: () => void;
  onSaved: () => void;
}

/** ISO string -> value for <input type="datetime-local"> in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function AdminEventForm({ event, onClose, onSaved }: Props) {
  const { t } = useTranslation('admin');

  const [name, setName] = useState(event?.name ?? '');
  const [venue, setVenue] = useState(event?.venue ?? '');
  const [city, setCity] = useState(event?.city ?? '');
  const [address, setAddress] = useState(event?.address ?? '');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [category, setCategory] = useState<EventCategory>(event?.category ?? 'other');
  const [startsAt, setStartsAt] = useState(toLocalInput(event?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(event?.ends_at ?? null));
  const [imageUrl, setImageUrl] = useState(event?.image_url ?? '');
  const [isActive, setIsActive] = useState(event?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    if (name.trim().length === 0) {
      setError(t('events.form.name_required'));
      return;
    }
    const startsIso = fromLocalInput(startsAt);
    if (!startsIso) {
      setError(t('events.form.starts_required'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc('admin_upsert_event', {
        p_id: event?.id ?? null,
        p_name: name.trim(),
        p_venue: venue.trim() || null,
        p_city: city.trim() || null,
        p_address: address.trim() || null,
        p_lat: lat.trim() ? Number(lat) : null,
        p_lng: lng.trim() ? Number(lng) : null,
        p_category: category,
        p_starts_at: startsIso,
        p_ends_at: fromLocalInput(endsAt),
        p_image_url: imageUrl.trim() || null,
        p_is_active: isActive,
      });
      if (rpcErr) throw rpcErr;
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('events.form.error'));
    } finally {
      setSaving(false);
    }
  }

  const labelStyle = { fontSize: 12, marginTop: 12, marginBottom: 4, display: 'block' } as const;

  return (
    <div className="match-modal-bg" role="dialog" aria-modal="true" onClick={() => !saving && onClose()}>
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '20px 22px calc(20px + env(safe-area-inset-bottom))',
        }}
      >
        <h2 style={{ margin: '0 0 8px' }}>
          {event ? t('events.form.edit_title') : t('events.form.create_title')}
        </h2>

        <label className="muted" style={labelStyle}>{t('events.form.name')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />

        <label className="muted" style={labelStyle}>{t('events.form.venue')}</label>
        <input value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={120} />

        <label className="muted" style={labelStyle}>{t('events.form.city')}</label>
        <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />

        <label className="muted" style={labelStyle}>{t('events.form.address')}</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} />

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="muted" style={labelStyle}>{t('events.form.lat')}</label>
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              placeholder={event ? '—' : ''}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="muted" style={labelStyle}>{t('events.form.lng')}</label>
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              inputMode="decimal"
              placeholder={event ? '—' : ''}
            />
          </div>
        </div>

        <label className="muted" style={labelStyle}>{t('events.form.category')}</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as EventCategory)}
          style={{ width: '100%' }}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{t(`events.categories.${c}`)}</option>
          ))}
        </select>

        <label className="muted" style={labelStyle}>{t('events.form.starts_at')}</label>
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />

        <label className="muted" style={labelStyle}>{t('events.form.ends_at')}</label>
        <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />

        <label className="muted" style={labelStyle}>{t('events.form.image_url')}</label>
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: 'var(--pink)' }}
          />
          <span style={{ fontSize: 14 }}>{t('events.form.is_active')}</span>
        </label>

        {error && <p style={{ color: 'var(--danger)', marginTop: 12, fontSize: 13 }}>{error}</p>}

        <button className="btn" style={{ marginTop: 18 }} disabled={saving} onClick={() => void save()}>
          {saving ? t('events.form.saving') : t('events.form.save')}
        </button>
        <button className="btn ghost" style={{ marginTop: 10 }} disabled={saving} onClick={onClose}>
          {t('events.form.cancel')}
        </button>
      </div>
    </div>
  );
}
