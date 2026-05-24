import { useCallback, useEffect, useRef, useState } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';

export interface GeolocationState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  loading: boolean;
  error: string | null;
}

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const LAST_UPDATE_KEY = 'beija_last_location_update';

async function getCurrentPosition(): Promise<GeolocationPosition['coords'] | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') {
        const req = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (req.location !== 'granted') return null;
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 60_000,
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude ?? null,
        altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
        heading: pos.coords.heading ?? null,
        speed: pos.coords.speed ?? null,
      } as GeolocationPosition['coords'];
    }
    // Web fallback
    if (!('geolocation' in navigator)) return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p.coords),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
      );
    });
  } catch {
    return null;
  }
}

async function pushLocationToServer(lat: number, lng: number): Promise<void> {
  // Uses the update_user_location RPC (see migrations/20260524200000_location_rpc.sql)
  await supabase.rpc('update_user_location', { p_lat: lat, p_lng: lng });
  try {
    localStorage.setItem(LAST_UPDATE_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}

/**
 * Reads the device location and pushes it to profiles.location on a 30-minute
 * cadence (and on app open). Returns the latest reading + loading/error state.
 */
export function useGeolocation(options: { autoUpdate?: boolean } = {}): GeolocationState & {
  refresh: () => Promise<void>;
} {
  const { autoUpdate = true } = options;
  const [state, setState] = useState<GeolocationState>({
    lat: null,
    lng: null,
    accuracy: null,
    loading: true,
    error: null,
  });
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const coords = await getCurrentPosition();
    if (!coords) {
      setState({
        lat: null,
        lng: null,
        accuracy: null,
        loading: false,
        error: 'permission_or_unavailable',
      });
      return;
    }
    setState({
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      loading: false,
      error: null,
    });
    if (autoUpdate) {
      try {
        await pushLocationToServer(coords.latitude, coords.longitude);
      } catch {
        /* server update is best-effort */
      }
    }
  }, [autoUpdate]);

  useEffect(() => {
    let cancelled = false;
    void refresh();
    timerRef.current = window.setInterval(() => {
      if (!cancelled) void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [refresh]);

  return { ...state, refresh };
}
