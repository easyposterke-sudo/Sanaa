/**
 * API base for fetch(). Empty in dev → relative `/api/...` (Vite proxy → backend).
 * Set VITE_API_URL=http://localhost:5174 if the proxy fails (404) or you use preview.
 */
export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
