/**
 * Capacitor-ready key/value storage. On native we'd swap to `@capacitor/preferences`.
 */
export const storage = {
  async get(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  },
  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  },
  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  },
};
