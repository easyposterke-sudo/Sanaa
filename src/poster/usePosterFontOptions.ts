import { useState, useEffect } from 'react';
import { POSTER_FONT_OPTIONS } from './posterFonts';
import { apiUrl } from '../lib/apiUrl';
import { fetchWithTimeout } from '../lib/api';
import { ensureFontPreviewFromUrl } from '../core/font/customFontCache';
import { getCustomFont } from '../core/font/customFontCache';
import { useEditorStore } from '../store/editorStore';

export interface FontOption {
  label: string;
  value: string;
  isCustom?: boolean;
}

function savedFontCacheId(id: string): string {
  return `cloud-font-${id}`;
}

/**
 * Font options for the poster editor: built-in + custom fonts from 3D editor
 * (session uploads and cloud-saved fonts).
 */
const EMPTY_IDS: string[] = [];

export function usePosterFontOptions(): FontOption[] {
  const [customOptions, setCustomOptions] = useState<FontOption[]>([]);
  const customFontIdsKey = useEditorStore((s) => (s.customFontIds ?? EMPTY_IDS).join(','));

  useEffect(() => {
    let cancelled = false;
    const customFontIds = useEditorStore.getState().customFontIds ?? EMPTY_IDS;

    (async () => {
      const options: FontOption[] = [];

      try {
        const res = await fetchWithTimeout(apiUrl('/api/fonts'));
        const data = (await res.json()) as unknown;
        const savedFonts = Array.isArray(data)
          ? (data as { id: string; label: string; fontUrl: string }[])
          : [];

        for (const entry of savedFonts) {
          const key = savedFontCacheId(entry.id);
          try {
            const family = await ensureFontPreviewFromUrl(key, entry.fontUrl);
            options.push({
              label: `${entry.label} (saved)`,
              value: family,
              isCustom: true,
            });
          } catch {
            /* CORS / load failed */
          }
        }
      } catch {
        /* Backend not available */
      }

      for (const id of customFontIds) {
        const cached = getCustomFont(id);
        if (!cached?.previewSourceUrl) continue;
        try {
          const family = await ensureFontPreviewFromUrl(id, cached.previewSourceUrl);
          const label = cached.name;
          if (!options.some((o) => o.value === family)) {
            options.push({ label: `${label} (session)`, value: family, isCustom: true });
          }
        } catch {
          /* ignore */
        }
      }

      if (!cancelled) {
        setCustomOptions(options);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [customFontIdsKey]);

  return [...POSTER_FONT_OPTIONS, ...customOptions];
}
