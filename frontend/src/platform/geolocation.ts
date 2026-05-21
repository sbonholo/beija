export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyMeters?: number;
}

/**
 * Capacitor-ready geolocation wrapper. On native we'd swap this implementation
 * for `@capacitor/geolocation`; the public surface stays identical.
 */
export async function getCurrentPosition(): Promise<GeoPoint | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyMeters: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
