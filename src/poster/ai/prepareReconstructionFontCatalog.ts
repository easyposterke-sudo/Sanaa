import type { ReconstructionFontCatalog } from '../../../shared/ai/posterReconstruction';
import {
  ensureFontPreviewFromUrl,
  getAllCustomFonts,
} from '../../core/font/customFontCache';
import { listFontLibrary } from '../services/fontLibraryApi';

const MAX_CATALOG_FONTS = 200;
const SHEET_WIDTH = 1400;
const SHEET_COLUMNS = 2;
const SHEET_ROWS = 24;
const ROW_HEIGHT = 78;
const COLUMN_WIDTH = SHEET_WIDTH / SHEET_COLUMNS;

interface FontCandidate {
  key: string;
  label: string;
  url: string;
}

interface LoadedFontCandidate extends FontCandidate {
  id: string;
  family: string;
}

export interface PreparedReconstructionFontCatalog {
  request: ReconstructionFontCatalog;
  families: Readonly<Record<string, string>>;
}

/**
 * Builds visual samples for the custom fonts already available in the editor.
 * Font files stay in the browser; only compact raster specimen sheets are sent to the AI.
 */
export async function prepareReconstructionFontCatalog(): Promise<PreparedReconstructionFontCatalog | null> {
  if (typeof document === 'undefined' || !('fonts' in document)) return null;

  const candidates = await collectCandidates();
  if (candidates.length === 0) return null;

  const loaded: LoadedFontCandidate[] = [];
  for (let start = 0; start < candidates.length; start += 6) {
    const batch = candidates.slice(start, start + 6);
    const results = await Promise.all(batch.map(async (candidate) => {
      try {
        const family = await ensureFontPreviewFromUrl(candidate.key, candidate.url);
        await document.fonts.load(`32px "${family}"`);
        return {
          ...candidate,
          id: reconstructionFontCatalogId(candidate.key),
          family,
        } satisfies LoadedFontCandidate;
      } catch {
        return null;
      }
    }));
    loaded.push(...results.filter((item): item is LoadedFontCandidate => item !== null));
  }
  if (loaded.length === 0) return null;

  const previewDataUrls: string[] = [];
  const fontsPerSheet = SHEET_COLUMNS * SHEET_ROWS;
  for (let start = 0; start < loaded.length; start += fontsPerSheet) {
    previewDataUrls.push(await renderSpecimenSheet(loaded.slice(start, start + fontsPerSheet)));
  }

  return {
    request: {
      entries: loaded.map(({ id, label }) => ({ id, label })),
      previewDataUrls,
    },
    families: Object.fromEntries(loaded.map(({ id, family }) => [id, family])),
  };
}

export function reconstructionFontCatalogId(key: string): string {
  let hash = 0x811c9dc5;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `c_${(hash >>> 0).toString(36)}`;
}

async function collectCandidates(): Promise<FontCandidate[]> {
  const candidates = new Map<string, FontCandidate>();
  try {
    const saved = await listFontLibrary();
    for (const entry of saved) {
      const key = `cloud-font-${entry.id}`;
      candidates.set(key, { key, label: entry.label, url: entry.fontUrl });
    }
  } catch {
    // Reconstruction remains available with built-in fonts when the library is offline.
  }

  for (const font of getAllCustomFonts()) {
    if (!font.previewSourceUrl || candidates.has(font.id)) continue;
    candidates.set(font.id, {
      key: font.id,
      label: font.name,
      url: font.previewSourceUrl,
    });
  }

  return [...candidates.values()].slice(0, MAX_CATALOG_FONTS);
}

async function renderSpecimenSheet(fonts: LoadedFontCandidate[]): Promise<string> {
  const rows = Math.ceil(fonts.length / SHEET_COLUMNS);
  const canvas = document.createElement('canvas');
  canvas.width = SHEET_WIDTH;
  canvas.height = Math.max(ROW_HEIGHT, rows * ROW_HEIGHT);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not prepare the custom font catalogue.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = 'alphabetic';

  fonts.forEach((font, index) => {
    const column = index % SHEET_COLUMNS;
    const row = Math.floor(index / SHEET_COLUMNS);
    const x = column * COLUMN_WIDTH + 18;
    const y = row * ROW_HEIGHT;

    context.fillStyle = '#64748b';
    context.font = '13px Arial, sans-serif';
    context.fillText(`${font.id} · ${truncate(font.label, 38)}`, x, y + 18);

    context.save();
    context.beginPath();
    context.rect(x, y + 22, COLUMN_WIDTH - 36, ROW_HEIGHT - 24);
    context.clip();
    context.fillStyle = '#111827';
    context.font = `36px "${font.family}"`;
    context.fillText('Aa Bb 123  WE ARE OPEN', x, y + 61);
    context.restore();

    context.strokeStyle = '#e2e8f0';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(column * COLUMN_WIDTH, y + ROW_HEIGHT - 1);
    context.lineTo((column + 1) * COLUMN_WIDTH, y + ROW_HEIGHT - 1);
    context.stroke();
  });

  return canvasToDataUrl(canvas);
}

function canvasToDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('The browser could not encode the custom font catalogue.'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('The custom font catalogue could not be read.'));
        reader.readAsDataURL(blob);
      },
      'image/webp',
      0.82,
    );
  });
}

function truncate(value: string, maximum: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length <= maximum ? compact : `${compact.slice(0, maximum - 1)}…`;
}
