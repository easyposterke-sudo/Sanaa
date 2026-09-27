import { describe, expect, it } from 'vitest';
import { EMPTY_REFERENCE_FIDELITY, ReferenceFidelitySchema } from '../../../shared/ai/referenceFidelity';
import { applyReferenceReview, expandReferenceElement, expandReferencePlan, POSTER_REFERENCE_JSON_SCHEMA } from '../../../shared/ai/referenceReconstructionContract';
import { MAX_REFERENCE_ELEMENTS, POSTER_RECONSTRUCTION_JSON_SCHEMA, PosterReconstructionRequestSchema } from '../../../shared/ai/posterReconstruction';
import { referenceElement, referencePlan } from './referenceTestFixtures';

describe('reference reconstruction contract', () => {
  it('expands compact layers and preserves old full plans', () => {
    const compact = { key: 'title', kind: 'text', label: 'Title', box: { x: .1, y: .1, width: .8, height: .2 }, angle: 0, opacity: 1, zIndex: 2, confidence: .9, text: 'HELLO', fontFamily: 'arial', fontSizeRatio: .08 };
    expect(expandReferenceElement(compact)).toMatchObject({ text: 'HELLO', imageRole: 'none', pathPoints: [] });
    expect(expandReferencePlan(referencePlan())).toEqual(referencePlan());
    expect(() => expandReferenceElement({ ...compact, text: undefined })).toThrow();
    expect(() => expandReferenceElement({ ...compact, executable: '<script>' })).toThrow();
  });

  it('allows dense references without expanding the creation output contract', () => {
    const dense = referencePlan(Array.from({ length: MAX_REFERENCE_ELEMENTS }, (_, index) => referenceElement({ key: `row_${index}` })));
    expect(expandReferencePlan(dense).elements).toHaveLength(MAX_REFERENCE_ELEMENTS);
    expect(POSTER_RECONSTRUCTION_JSON_SCHEMA.properties.elements.maxItems).toBe(45);
    expect(() => expandReferencePlan({ ...dense, elements: [...dense.elements, referenceElement()] })).toThrow();
    expect(() => expandReferencePlan(referencePlan([referenceElement(), referenceElement()]))).toThrow();
  });

  it('rejects unbounded geometry and invalid paint', () => {
    expect(ReferenceFidelitySchema.safeParse({ ...EMPTY_REFERENCE_FIDELITY, shadow: { color: '#ffffff', opacity: 1, blurRatio: 500, offsetXRatio: 0, offsetYRatio: 0 } }).success).toBe(false);
    expect(ReferenceFidelitySchema.safeParse({ ...EMPTY_REFERENCE_FIDELITY, path: { nodes: [{ x: 0, y: 0, incoming: null, outgoing: { x: 999, y: 0 } }, { x: 1, y: 1, incoming: null, outgoing: null }], holes: [], fillRule: 'evenodd' } }).success).toBe(false);
  });

  it('only corrects vectors while retaining protected images, 3D and exact wording', () => {
    const text = referenceElement({ key: 'title', kind: 'text', text: '31ST DEC, 2026' });
    const image = referenceElement({ key: 'speaker', kind: 'image_region', imageRole: 'person' });
    const threeD = referenceElement({ key: 'depth', kind: 'text', textEffect: 'two_layer_3d' });
    const previous = referencePlan([text, image, threeD]);
    const patch = { summary: 'Position', upsert: [{ ...text, angle: -5 }], canvas: null };
    const result = applyReferenceReview(previous, patch);
    expect(result.elements[0]!.angle).toBe(-5);
    expect(result.elements.slice(1)).toEqual(previous.elements.slice(1));
    for (const item of [image, threeD, { ...text, text: '31 DEC 2026' }, { ...text, opacity: 0 }]) {
      expect(() => applyReferenceReview(previous, { ...patch, upsert: [item] })).toThrow();
    }
    expect(() => applyReferenceReview(previous, { ...patch, removeKeys: ['speaker'] })).toThrow();
    expect(() => applyReferenceReview(previous, { ...patch, upsert: [text, text] })).toThrow();
  });

  it('does not accept reference review mixed with creation', () => {
    const request = { reference: { dataUrl: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==', width: 800, height: 1000 }, quality: 'quality', creation: { prompt: 'A church poster', seed: 'test', referenceId: 1, phase: 'design', assets: [] }, referenceReview: { previousPlan: referencePlan(), draftDataUrl: 'data:image/png;base64,AAAA', feedback: [] } };
    expect(PosterReconstructionRequestSchema.safeParse(request).success).toBe(false);
  });

  it('uses strict provider objects with all declared properties required', () => {
    function inspect(value: unknown) {
      if (!value || typeof value !== 'object') return;
      const schema = value as Record<string, unknown>;
      if (schema.type === 'object') {
        expect(schema.additionalProperties).toBe(false);
        expect([...(schema.required as string[])].sort()).toEqual(Object.keys(schema.properties as object).sort());
      }
      for (const child of Object.values(schema)) {
        if (Array.isArray(child)) child.forEach(inspect); else inspect(child);
      }
    }
    inspect(POSTER_REFERENCE_JSON_SCHEMA);
  });
});
