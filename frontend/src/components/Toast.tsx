import { useState, useCallback, ReactNode, createContext, useContext } from 'react';

type ToastKind = 'kiss' | 'heart' | 'fire' | 'match' | 'info';
interface ToastItem { id: number; kind: ToastKind; text: string }

const Ctx = createContext<(t: { kind: ToastKind; text: string }) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((t: { kind: ToastKind; text: string }) => {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { ...t, id }]);
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
      ))}
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
