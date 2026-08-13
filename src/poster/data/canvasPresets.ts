export interface CanvasPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  category: 'paper' | 'social' | 'custom';
  description?: string;
}

/** Paper sizes at 96 DPI (web standard). */
export const PAPER_PRESETS: CanvasPreset[] = [
  { id: 'a4', label: 'A4', width: 794, height: 1123, category: 'paper', description: '210 × 297 mm' },
  { id: 'a4-landscape', label: 'A4 Landscape', width: 1123, height: 794, category: 'paper', description: '297 × 210 mm' },
  { id: 'a3', label: 'A3', width: 1123, height: 1587, category: 'paper', description: '297 × 420 mm' },
  { id: 'a3-landscape', label: 'A3 Landscape', width: 1587, height: 1123, category: 'paper', description: '420 × 297 mm' },
  { id: 'letter', label: 'US Letter', width: 816, height: 1056, category: 'paper', description: '8.5 × 11 in' },
  { id: 'letter-landscape', label: 'US Letter Landscape', width: 1056, height: 816, category: 'paper', description: '11 × 8.5 in' },
  { id: 'legal', label: 'US Legal', width: 816, height: 1344, category: 'paper', description: '8.5 × 14 in' },
  { id: 'tabloid', label: 'Tabloid (11×17)', width: 1056, height: 1632, category: 'paper', description: '11 × 17 in' },
];

/** Social media and digital formats. */
export const SOCIAL_PRESETS: CanvasPreset[] = [
  { id: 'instagram-post', label: 'Instagram Post', width: 1080, height: 1080, category: 'social', description: '1:1 square' },
  { id: 'instagram-story', label: 'Instagram Story', width: 1080, height: 1920, category: 'social', description: '9:16' },
  { id: 'facebook-post', label: 'Facebook Post', width: 1200, height: 630, category: 'social', description: '1.91:1' },
  { id: 'youtube-thumbnail', label: 'YouTube Thumbnail', width: 1280, height: 720, category: 'social', description: '16:9' },
  { id: 'pinterest-pin', label: 'Pinterest Pin', width: 1000, height: 1500, category: 'social', description: '2:3' },
  { id: 'twitter-post', label: 'Twitter / X Post', width: 1200, height: 675, category: 'social', description: '16:9' },
  { id: 'linkedin-banner', label: 'LinkedIn Banner', width: 1200, height: 627, category: 'social', description: '1.91:1' },
  { id: 'tiktok', label: 'TikTok', width: 1080, height: 1920, category: 'social', description: '9:16' },
];

/** Quick presets for common aspect ratios. */
export const ASPECT_PRESETS: CanvasPreset[] = [
  { id: 'square', label: 'Square', width: 800, height: 800, category: 'custom', description: '1:1' },
  { id: 'landscape-16-9', label: 'Landscape 16:9', width: 1280, height: 720, category: 'custom', description: 'Widescreen' },
  { id: 'portrait-4-5', label: 'Portrait 4:5', width: 800, height: 1000, category: 'custom', description: '4:5' },
  { id: 'default', label: 'Default', width: 800, height: 600, category: 'custom', description: '4:3' },
];

export const ALL_PRESETS: CanvasPreset[] = [
  ...PAPER_PRESETS,
  ...SOCIAL_PRESETS,
  ...ASPECT_PRESETS,
];
