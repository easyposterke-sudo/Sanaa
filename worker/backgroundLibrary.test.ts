import { describe, expect, it } from 'vitest';
import {
  cleanPosterBackgroundLabel,
  findTemplateBackgroundCandidates,
  isPosterBackgroundMediaType,
  matchesPosterBackgroundSignature,
  parsePosterBackgroundDataUrl,
  posterBackgroundContentId,
  posterBackgroundObjectKey,
} from './backgroundLibrary';

describe('poster background library helpers', () => {
  it('accepts only browser-safe raster formats', () => {
    expect(isPosterBackgroundMediaType('image/png')).toBe(true);
    expect(isPosterBackgroundMediaType('image/jpeg')).toBe(true);
    expect(isPosterBackgroundMediaType('image/webp')).toBe(true);
    expect(isPosterBackgroundMediaType('image/svg+xml')).toBe(false);
  });

  it('validates image signatures', () => {
    expect(
      matchesPosterBackgroundSignature(
        'image/png',
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe(true);
    expect(matchesPosterBackgroundSignature('image/jpeg', Uint8Array.from([1, 2, 3]))).toBe(
      false,
    );
  });

  it('cleans labels and produces owner-scoped R2 keys', () => {
    expect(cleanPosterBackgroundLabel('Sunday%20Gold', 'fallback')).toBe('Sunday Gold');
    expect(cleanPosterBackgroundLabel('', 'blue-paper.jpg')).toBe('blue-paper.jpg');
    expect(posterBackgroundObjectKey('owner@example.com', 'bg-1', 'paper gold.jpg')).toBe(
      'owners/owner%40example.com/backgrounds/bg-1/paper%20gold.jpg',
    );
  });

  it('finds explicitly marked and legacy named template backgrounds', () => {
    const webp = 'data:image/webp;base64,UklGRgAAAABXRUJQ';
    expect(
      findTemplateBackgroundCandidates({
        elements: [
          {
            id: 'new-background',
            type: 'image',
            src: webp,
            assetRole: 'background',
            backgroundLibraryLabel: 'Pexels worship stage',
          },
          {
            id: 'old-background',
            type: 'image',
            src: webp,
            layerName: 'AI replacement: Blue background',
          },
          {
            id: 'guide',
            type: 'image',
            src: webp,
            layerName: 'Background reference guide',
            excludeFromExport: true,
          },
          {
            id: 'already-saved',
            type: 'image',
            src: '/api/poster-backgrounds/bg-1/file',
            layerName: 'Background: Gold paper',
          },
        ],
      }),
    ).toEqual([
      { src: webp, label: 'Pexels worship stage' },
      { src: webp, label: 'Blue background' },
    ]);
  });

  it('parses valid background data URLs and creates stable owner-scoped ids', async () => {
    const bytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const encoded = btoa(String.fromCharCode(...bytes));
    const parsed = parsePosterBackgroundDataUrl(`data:image/png;base64,${encoded}`);
    expect(parsed).toEqual({ mediaType: 'image/png', bytes });
    expect(parsePosterBackgroundDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();

    const first = await posterBackgroundContentId('owner-a', bytes);
    expect(await posterBackgroundContentId('owner-a', bytes)).toBe(first);
    expect(await posterBackgroundContentId('owner-b', bytes)).not.toBe(first);
  });
});
