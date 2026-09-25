const THREE_FONT_BASE =
  'https://cdn.jsdelivr.net/npm/three@0.183.2/examples/fonts';

/** Map editor fontFamily (CSS font name) to Three.js typeface filename. */
const FONT_FAMILY_TO_TYPEFACE: Record<string, string> = {
  'Arial Black, sans-serif': 'helvetiker_bold',
  'Impact, sans-serif': 'helvetiker_bold',
  '"Bebas Neue", sans-serif': 'helvetiker_bold',
  '"Oswald", sans-serif': 'helvetiker_bold',
  '"Montserrat", sans-serif': 'helvetiker_bold',
  '"Poppins", sans-serif': 'helvetiker_bold',
  '"Inter", sans-serif': 'helvetiker_regular',
  '"Roboto", sans-serif': 'helvetiker_regular',
  '"Open Sans", sans-serif': 'helvetiker_regular',
  '"Lato", sans-serif': 'helvetiker_regular',
  '"Raleway", sans-serif': 'helvetiker_regular',
  '"Source Sans 3", sans-serif': 'helvetiker_regular',
  '"Nunito", sans-serif': 'helvetiker_regular',
  'Franklin Gothic Medium, sans-serif': 'helvetiker_bold',
  'Verdana, sans-serif': 'helvetiker_regular',
  '"Trebuchet MS", sans-serif': 'helvetiker_regular',
  'Century Gothic, sans-serif': 'helvetiker_regular',
  'Georgia, serif': 'gentilis_regular',
  'Times New Roman, serif': 'gentilis_regular',
  '"Merriweather", serif': 'gentilis_regular',
  '"Playfair Display", serif': 'gentilis_regular',
  '"Crimson Pro", serif': 'gentilis_regular',
  'Palatino Linotype, Book Antiqua, serif': 'gentilis_regular',
  'Courier New, monospace': 'optimer_regular',
  'Brush Script MT, cursive': 'gentilis_regular',
  'Lucida Handwriting, cursive': 'gentilis_regular',
  'Segoe Script, cursive': 'gentilis_regular',
  'Bradley Hand, cursive': 'gentilis_regular',
  '"Great Vibes", cursive': 'gentilis_regular',
  '"Dancing Script", cursive': 'gentilis_regular',
  '"Allura", cursive': 'gentilis_regular',
  '"Sacramento", cursive': 'gentilis_regular',
  '"Satisfy", cursive': 'gentilis_regular',
  '"Pacifico", cursive': 'gentilis_regular',
  '"Tangerine", cursive': 'gentilis_regular',
};

export function getTypefaceUrl(fontFamily: string): string {
  const name = FONT_FAMILY_TO_TYPEFACE[fontFamily] ?? 'helvetiker_regular';
  return `${THREE_FONT_BASE}/${name}.typeface.json`;
}
