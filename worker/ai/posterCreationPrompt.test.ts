import { describe, expect, it } from 'vitest';
import { PosterReconstructionRequestSchema, createFallbackReconstructionPlan, type PosterReconstructionRequest } from '../../shared/ai/posterReconstruction';
import { posterCreationPrompt } from './posterCreationPrompt';

const request: PosterReconstructionRequest = {
  reference: { dataUrl: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==', width: 1080, height: 1350 },
  quality: 'quality',
  creation: { prompt: 'Sunday Service for Hope Church, every Sunday at 9 AM.', seed: 'test', referenceId: 6, phase: 'design', assets: [] },
};
describe('prompt-based poster creation', () => {
  it('preserves distinct headline directions and exposes shape gradient controls', () => {
    const script = posterCreationPrompt({ ...request, creation: { ...request.creation!, referenceId: 2 } });
    const sharedInitial = posterCreationPrompt({ ...request, creation: { ...request.creation!, referenceId: 3 } });
    expect(script).toContain('separate allura or great_vibes Service');
    expect(sharedInitial).toContain('UNDAY above ERVICE');
    expect(script).toContain('These fields also apply to rect/circle/ellipse/triangle/star');
  });
  it('loads the purple framed logistics family and its headline direction', () => {
    const selected = { ...request, creation: { ...request.creation!, referenceId: 11 } };
    expect(PosterReconstructionRequestSchema.safeParse(selected).success).toBe(true);
    expect(posterCreationPrompt(selected)).toContain('church-service-011');
    expect(posterCreationPrompt(selected)).toContain('Use tall gold bebas_neue');
  });
  it.each([12, 13, 14, 15, 16, 17, 18])('loads individual service reference %i with its art direction', referenceId => {
    const selected = { ...request, creation: { ...request.creation!, referenceId } };
    expect(PosterReconstructionRequestSchema.safeParse(selected).success).toBe(true);
    const prompt = posterCreationPrompt(selected);
    expect(prompt).toContain(`church-service-${String(referenceId).padStart(3, '0')}`);
    expect(prompt).not.toContain('REQUIRED DESIGN CHARACTER: undefined');
    expect(prompt).not.toContain('conference-001');
  });
  it('loads the selected real annotation and the runtime layout skill', () => {
    const prompt = posterCreationPrompt(request);
    expect(prompt).toContain('church-service-006');
    expect(prompt).toContain('layout.dominant-alignment');
    expect(prompt).toContain('Never borrow names');
    expect(prompt).not.toContain('church-service-002');
  });
  it('requires a prior manifest for review and bounds reference selection', () => {
    expect(PosterReconstructionRequestSchema.safeParse(request).success).toBe(true);
    expect(PosterReconstructionRequestSchema.safeParse({ ...request, creation: { ...request.creation, phase: 'review' } }).success).toBe(false);
    expect(PosterReconstructionRequestSchema.safeParse({ ...request, creation: { ...request.creation, referenceId: 8 } }).success).toBe(true);
    expect(PosterReconstructionRequestSchema.safeParse({ ...request, creation: { ...request.creation, referenceId: 19 } }).success).toBe(false);
    expect(PosterReconstructionRequestSchema.safeParse({ ...request, creation: { ...request.creation, assets: [{ role: 'person', dataUrl: 'https://example.com/unsafe', width: 100, height: 100 }] } }).success).toBe(false);
  });
  it('loads the editorial theme family', () => {
    const selected = { ...request, creation: { ...request.creation!, referenceId: 9 } };
    expect(PosterReconstructionRequestSchema.safeParse(selected).success).toBe(true);
    expect(posterCreationPrompt(selected)).toContain('church-service-009');
    expect(posterCreationPrompt(selected)).toContain('red word circles');
  });
  it('loads the purple layered occasion family', () => {
    const selected = { ...request, creation: { ...request.creation!, referenceId: 10 } };
    expect(PosterReconstructionRequestSchema.safeParse(selected).success).toBe(true);
    expect(posterCreationPrompt(selected)).toContain('church-service-010');
    expect(posterCreationPrompt(selected)).toContain('clothing-matched-palette');
  });
  it('loads the weekday three-person design family', () => {
    const prompt = posterCreationPrompt({ ...request, creation: { ...request.creation!, referenceId: 8 } });
    expect(prompt).toContain('church-service-008');
    expect(prompt).toContain('face-safe portrait overlap');
    expect(prompt).not.toContain('church-service-007');
  });
  it('instructs review to preserve the composition and inspect the rendered image', () => {
    const prompt = posterCreationPrompt({ ...request, creation: { ...request.creation!, phase: 'review', previousPlan: createFallbackReconstructionPlan() } });
    expect(prompt).toContain('actual rendered draft');
    expect(prompt).toContain('Do not start a new concept');
  });
});
