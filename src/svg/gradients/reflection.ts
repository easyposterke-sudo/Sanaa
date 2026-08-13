/**
 * Top reflection overlay gradient for glossy balloon-style metallic text.
 * Blends with mix-blend-mode: screen for highlight effect.
 */
export const reflectionGradient = {
  id: 'reflectionGradient',
  stops: [
    { offset: '0%', color: 'white', opacity: 0.95 },
    { offset: '15%', color: 'white', opacity: 0.6 },
    { offset: '35%', color: 'white', opacity: 0.25 },
    { offset: '55%', color: 'white', opacity: 0.08 },
    { offset: '100%', color: 'white', opacity: 0 },
  ],
};

export function buildReflectionGradientDef(): string {
  const stopsXml = reflectionGradient.stops
    .map(
      (s) =>
        `<stop offset="${s.offset}" stop-color="${s.color}" stop-opacity="${s.opacity}"/>`
    )
    .join('\n    ');
  return `
  <linearGradient id="${reflectionGradient.id}" x1="0%" y1="0%" x2="0%" y2="100%">
    ${stopsXml}
  </linearGradient>`;
}
