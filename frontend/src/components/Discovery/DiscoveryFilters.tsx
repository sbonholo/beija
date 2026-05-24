import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type SeekingUI = 'women' | 'men' | 'all';

const ALL_GENDERS = ['woman', 'man', 'non-binary', 'other'] as const;

function seekingToArray(s: SeekingUI): string[] {
  if (s === 'women') return ['woman'];
  if (s === 'men') return ['man'];
  return [...ALL_GENDERS];
}

function seekingFromArray(arr: string[] | null): SeekingUI {
  if (!arr || arr.length === 0) return 'all';
  if (arr.length === ALL_GENDERS.length) return 'all';
  if (arr.length === 1 && arr[0] === 'woman') return 'women';
  if (arr.length === 1 && arr[0] === 'man') return 'men';
  return 'all';
}

interface Props {
  onClose: () => void;
  onApplied?: () => void;
}

export function DiscoveryFilters({ onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(50);
  const [maxDistance, setMaxDistance] = useState(50);
  const [seeking, setSeeking] = useState<SeekingUI>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) return;
        const { data } = await supabase
          .from('profiles')
          .select('min_age, max_age, max_distance_km, interested_in')
          .eq('id', uid)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          setMinAge(data.min_age ?? 18);
          setMaxAge(data.max_age ?? 50);
          setMaxDistance(data.max_distance_km ?? 50);
          setSeeking(seekingFromArray((data.interested_in as string[] | null) ?? null));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error('not_authenticated');
      if (minAge > maxAge) throw new Error('Idade mínima maior que a máxima.');
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          min_age: minAge,
          max_age: maxAge,
          max_distance_km: maxDistance,
          interested_in: seekingToArray(seeking),
        })
        .eq('id', uid);
      if (updateErr) throw updateErr;
      onApplied?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar filtros.');
    } finally {
      setSaving(false);
    }
  }, [minAge, maxAge, maxDistance, seeking, onApplied, onClose]);

  return (
    <div className="person-sheet-bg" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="person-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingTop: 10 }}
      >
        <div className="person-sheet-handle" aria-hidden />
        <h2 style={{ margin: '4px 0 14px' }}>Filtros</h2>

        {loading ? (
          <p className="muted">Carregando…</p>
        ) : (
          <>
            <label className="muted" style={{ fontSize: 13, display: 'block' }}>
              Quem você quer conhecer
            </label>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className={`chip ${seeking === 'women' ? 'selected' : ''}`}
                onClick={() => setSeeking('women')}
              >
                ♀️ Mulheres
              </button>
              <button
                type="button"
                className={`chip ${seeking === 'men' ? 'selected' : ''}`}
                onClick={() => setSeeking('men')}
              >
                ♂️ Homens
              </button>
              <button
                type="button"
                className={`chip ${seeking === 'all' ? 'selected' : ''}`}
                onClick={() => setSeeking('all')}
              >
                💫 Todos
              </button>
            </div>

            <label className="muted" style={{ fontSize: 13, marginTop: 18, display: 'block' }}>
              Faixa etária: <span style={{ color: 'var(--text)' }}>{minAge} – {maxAge}</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              <input
                type="range"
                min={18}
                max={99}
                value={minAge}
                onChange={(e) => setMinAge(Math.min(parseInt(e.target.value, 10), maxAge))}
                aria-label="Idade mínima"
              />
              <input
                type="range"
                min={18}
                max={99}
                value={maxAge}
                onChange={(e) => setMaxAge(Math.max(parseInt(e.target.value, 10), minAge))}
                aria-label="Idade máxima"
              />
            </div>

            <label className="muted" style={{ fontSize: 13, marginTop: 18, display: 'block' }}>
              Distância máxima: <span style={{ color: 'var(--text)' }}>{maxDistance} km</span>
            </label>
            <input
              type="range"
              min={1}
              max={100}
              value={maxDistance}
              onChange={(e) => setMaxDistance(parseInt(e.target.value, 10))}
              style={{ marginTop: 6 }}
              aria-label="Distância máxima em km"
            />

            {error && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</p>
            )}

            <button
              className="btn"
              style={{ marginTop: 22 }}
              disabled={saving}
              onClick={apply}
            >
              {saving ? 'Aplicando...' : 'Aplicar'}
            </button>
            <button
              className="btn ghost"
              style={{ marginTop: 10 }}
              disabled={saving}
              onClick={onClose}
            >
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
