import { useEffect, useState } from 'react';

export function useNavigationState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try { const saved = sessionStorage.getItem(key); return saved ? JSON.parse(saved) : fallback; }
    catch { return fallback; }
  });
  useEffect(() => { sessionStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue] as const;
}
