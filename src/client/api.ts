import { useEffect, useState, useCallback } from 'react';
let csrf = '';
export const setCsrf = (value: string) => {
  csrf = value;
};
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public requestId?: string,
  ) {
    super(code);
  }
}
export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        'X-CSRF-Token': csrf,
        ...options.headers,
      },
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('network_error', 0);
  }
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login')
      window.dispatchEvent(new Event('claso-session-expired'));
    throw new ApiError(body.error || 'server_error', response.status, body.request_id);
  }
  return body;
}
export const mutate = (path: string, body: any = {}, method = 'POST') =>
  api(path, { method, body: JSON.stringify(body) });
export const navigate = (path: string) => {
  window.location.hash = path;
};
export function useRoute() {
  const [path, set] = useState(window.location.hash.slice(1) || '/');
  useEffect(() => {
    const onHash = () => set(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return path;
}
export function useData<T = any>(path: string | null) {
  const [state, set] = useState<{ data: T | null; loading: boolean; error: ApiError | null }>({
    data: null,
    loading: !!path,
    error: null,
  });
  const [revision, refresh] = useState(0);
  const reload = useCallback(() => refresh((x) => x + 1), []);
  useEffect(() => {
    if (!path) {
      set({ data: null, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    set({ data: null, loading: true, error: null });
    api<T>(path, { signal: controller.signal })
      .then((data) => set({ data, loading: false, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') set({ data: null, loading: false, error });
      });
    return () => controller.abort();
  }, [path, revision]);
  return { ...state, reload };
}
export function useDebounce(value: string, delay = 250) {
  const [result, set] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => set(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return result;
}
