import opentype from 'opentype.js';
import type { PosterElement, Poster3DTextElement } from './types';
import { apiFetch, fetchWithTimeout } from '../lib/api';
import {
  addCustomFont,
  ensureFontPreviewFromUrl,
  familyNameForPreviewKey,
  getAllCustomFonts,
  getCustomFont,
} from '../core/font/customFontCache';
import { useEditorStore } from '../store/editorStore';
import { listFontLibrary } from './services/fontLibraryApi';

type SavedFontEntry = { id: string; label: string; fontUrl: string };

function firstFamilyName(stack: string): string | null {
  const part = stack.split(',')[0]?.trim();
  if (!part) return null;
  const unquoted = part.replace(/^["']+|["']+$/g, '').trim();
  return unquoted || null;
}

/**
 * Ensures fonts referenced by poster text exist in `document.fonts` before Fabric measures text.
 * Cloud fonts are fetched from `/api/fonts`; session fonts use the in-memory custom font cache.
 */
export async function loadFontsForPosterElements(elements: PosterElement[]): Promise<void> {
  const families = new Set<string>();
  const customFontIds3D = new Set<string>();

  for (const el of elements) {
    if (el.type === 'text' && typeof el.fontFamily === 'string') {
      const f = el.fontFamily.trim();
      if (f) families.add(f);
    }
    if (el.type === '3d-text') {
      const e3d = el as Poster3DTextElement;
      if (e3d.config?.selectedCustomFontId) {
        customFontIds3D.add(e3d.config.selectedCustomFontId);
      }
      if (e3d.config?.text?.fontFamily) {
        families.add(e3d.config.text.fontFamily);
      }
    }
  }
  if (families.size === 0 && customFontIds3D.size === 0) return;

  const neededCustom = new Set([...families].filter((f) => f.startsWith('Editor3DCustom_')));

  if (neededCustom.size > 0 || customFontIds3D.size > 0) {
    let savedFonts: SavedFontEntry[] = [];
    try {
      savedFonts = await listFontLibrary();
    } catch {
      /* offline / 503 */
    }

    for (const entry of savedFonts) {
      const key = `cloud-font-${entry.id}`;
      const fam = familyNameForPreviewKey(key);
      const isNeededFor3D = customFontIds3D.has(key);
      if (!neededCustom.has(fam) && !isNeededFor3D) continue;

      try {
        await ensureFontPreviewFromUrl(key, entry.fontUrl);
        if (isNeededFor3D && !getCustomFont(key)) {
          const fres = entry.fontUrl.startsWith('/api/')
            ? await apiFetch(entry.fontUrl)
            : await fetchWithTimeout(entry.fontUrl);
          if (fres.ok) {
            const buf = await fres.arrayBuffer();
            const font = opentype.parse(buf);
            const name = font.names?.fontFamily?.en || font.names?.fullName?.en || entry.label;
            addCustomFont(key, name, font, entry.fontUrl);
          }
        }
      } catch {
        /* CORS / bad file */
      }
    }

    const sessionIds = useEditorStore.getState().customFontIds ?? [];
    for (const id of sessionIds) {
      const fam = familyNameForPreviewKey(id);
      if (!neededCustom.has(fam)) continue;
      const cached = getCustomFont(id);
      if (!cached?.previewSourceUrl) continue;
      try {
        await ensureFontPreviewFromUrl(id, cached.previewSourceUrl);
      } catch {
        /* ignore */
      }
    }

    for (const c of getAllCustomFonts()) {
      if (!c.previewSourceUrl) continue;
      const fam = familyNameForPreviewKey(c.id);
      if (!neededCustom.has(fam)) continue;
      try {
        await ensureFontPreviewFromUrl(c.id, c.previewSourceUrl);
      } catch {
        /* ignore */
      }
    }

    for (const fam of neededCustom) {
      try {
        await document.fonts.load(`16px "${fam}"`);
      } catch {
        /* ignore */
      }
    }
  }

  for (const stack of families) {
    if (stack.startsWith('Editor3DCustom_')) continue;
    const primary = firstFamilyName(stack);
    if (!primary) continue;
    try {
      await document.fonts.load(`16px "${primary}"`);
    } catch {
      /* ignore */
    }
  }
}
