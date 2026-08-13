import { describe, it, expect } from 'vitest';
import { generateElementId } from './generateElementId';

describe('generateElementId', () => {
  it('returns a string starting with "el_"', () => {
    const id = generateElementId();
    expect(id.startsWith('el_')).toBe(true);
  });

  it('contains a timestamp segment', () => {
    const before = Date.now();
    const id = generateElementId();
    const after = Date.now();
    const parts = id.split('_');
    const timestamp = Number(parts[1]);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('contains a random suffix', () => {
    const id = generateElementId();
    const parts = id.split('_');
    expect(parts[2]).toBeDefined();
    expect(parts[2].length).toBeGreaterThanOrEqual(1);
    expect(parts[2].length).toBeLessThanOrEqual(9);
  });

  it('generates unique IDs across multiple calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateElementId()));
    expect(ids.size).toBe(100);
  });
});
