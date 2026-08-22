import { useState, useEffect } from 'react';
import { POSTER_FONT_OPTIONS } from './posterFonts';
import {
  ensureFontPreviewFromUrl,
  familyNameForPreviewKey,
  getCustomFont,
} from '../core/font/customFontCache';
import { useEditorStore } from '../store/editorStore';
import {
  FONT_LIBRARY_CHANGED_EVENT,
  listFontLibrary,
} from './services/fontLibraryApi';

export interface FontOption {
  label: string;
  value: string;
  isCustom?: boolean;
  previewKey?: string;
  fontUrl?: string;
  fontId?: string;
  canDelete?: boolean;
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
  const [libraryRevision, setLibraryRevision] = useState(0);
  const customFontIdsKey = useEditorStore((s) => (s.customFontIds ?? EMPTY_IDS).join(','));

  useEffect(() => {
    const refresh = () => setLibraryRevision((revision) => revision + 1);
    window.addEventListener(FONT_LIBRARY_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(FONT_LIBRARY_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const customFontIds = useEditorStore.getState().customFontIds ?? EMPTY_IDS;

    (async () => {
      const options: FontOption[] = [];

      try {
        const savedFonts = await listFontLibrary();
        for (const entry of savedFonts) {
          const key = savedFontCacheId(entry.id);
          options.push({
            label: `${entry.label} (saved)`,
            value: familyNameForPreviewKey(key),
            isCustom: true,
            previewKey: key,
            fontUrl: entry.fontUrl,
            fontId: entry.id,
            canDelete: entry.canDelete,
          });
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
  }, [customFontIdsKey, libraryRevision]);

  return [...POSTER_FONT_OPTIONS, ...customOptions];
}
