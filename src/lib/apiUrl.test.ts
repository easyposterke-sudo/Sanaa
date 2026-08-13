import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiUrl } from './apiUrl';

describe('apiUrl', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', '');
  });

  it('adds leading slash if missing', () => {
    expect(apiUrl('test')).toBe('/test');
  });

  it('keeps leading slash if present', () => {
    expect(apiUrl('/test')).toBe('/test');
  });

  it('prepends VITE_API_URL if set', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com');
    expect(apiUrl('/v1/data')).toBe('https://api.example.com/v1/data');
  });

  it('strips trailing slash from VITE_API_URL', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/');
    expect(apiUrl('/v1/data')).toBe('https://api.example.com/v1/data');
  });

  it('returns absolute URL as-is', () => {
    const absoluteUrl = 'https://other-domain.com/api/test';
    expect(apiUrl(absoluteUrl)).toBe(absoluteUrl);

    const httpUrl = 'http://localhost:5000/api/test';
    expect(apiUrl(httpUrl)).toBe(httpUrl);
  });

  it('does not prepend VITE_API_URL if path is absolute', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com');
    const absoluteUrl = 'https://other-domain.com/api/test';
    expect(apiUrl(absoluteUrl)).toBe(absoluteUrl);
  });
});
