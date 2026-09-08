import type { PosterTextElement } from '../types';

export type InkRect = { left: number; top: number; width: number; height: number };

/** Creation-only optical grouping, using rendered ink rather than loose AI boxes. */
export function alignCreatedTypography(
  texts: PosterTextElement[],
  measure: (text: PosterTextElement) => InkRect,
  canvas: { width: number; height: number },
  themeIds: ReadonlySet<string>,
) {
  const upright = texts.filter(text => Math.abs(text.angle) < .01 && !text.curve);
  const find = (word: string) => upright.filter(text => text.text.trim().toUpperCase() === word);
  const initials = find('S'), first = find('UNDAY'), second = find('ERVICE');
  if (initials.length === 1 && first.length === 1 && second.length === 1) {
    const initial = initials[0], a = measure(first[0]), b = measure(second[0]);
    const old = measure(initial);
    if (a.top < b.top && old.left < Math.min(a.left, b.left)) {
      const top = a.top, bottom = b.top + b.height;
      const factor = (bottom - top) / Math.max(1, old.height);
      const saved = { ...initial };
      initial.fontSize *= factor;
      initial.width = (initial.width ?? old.width) * factor;
      const resized = measure(initial);
      const right = Math.min(a.left, b.left) - canvas.width * .012;
      initial.left += right - resized.left - resized.width;
      initial.top += top - resized.top;
      if (measure(initial).left < canvas.width * .04) Object.assign(initial, saved);
    }
  }
  const phrases = texts.filter(text => themeIds.has(text.id) && text.text.trim().toUpperCase() !== 'THEME' && Math.abs(text.angle) < .01 && !text.curve);
  // Ambiguous multi-theme compositions remain under visual review.
  if (phrases.length !== 1) return;
  const phrase = measure(phrases[0]);
  for (const label of texts.filter(text => text.text.trim().toUpperCase() === 'THEME' && Math.abs(Math.abs(text.angle) - 90) < .01 && !text.curve)) {
    const saved = { ...label }, old = measure(label);
    const targetHeight = Math.min(phrase.height * .85, canvas.height * .09);
    const factor = targetHeight / Math.max(1, old.height);
    label.fontSize *= factor;
    label.width = (label.width ?? old.height) * factor;
    const resized = measure(label);
    label.left += phrase.left - canvas.width * .012 - resized.width - resized.left;
    label.top += phrase.top + (phrase.height - resized.height) / 2 - resized.top;
    const bounds = measure(label);
    const collides = texts.some(text => text !== label && text !== phrases[0] && (() => {
      const other = measure(text);
      return bounds.left < other.left + other.width && bounds.left + bounds.width > other.left && bounds.top < other.top + other.height && bounds.top + bounds.height > other.top;
    })());
    if (bounds.left < canvas.width * .04 || bounds.top < canvas.height * .04 || collides) Object.assign(label, saved);
  }
}
