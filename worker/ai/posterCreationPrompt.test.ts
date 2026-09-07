import { describe, expect, it } from 'vitest';
import { PosterReconstructionRequestSchema, createFallbackReconstructionPlan, type PosterReconstructionRequest } from '../../shared/ai/posterReconstruction';
import { posterCreationPrompt } from './posterCreationPrompt';

const request: PosterReconstructionRequest = {
  reference: { dataUrl: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==', width: 1080, height: 1350 },
  quality: 'quality',
  creation: { prompt: 'Sunday Service for Hope Church, every Sunday at 9 AM.', seed: 'test', referenceId: 6, phase: 'design', assets: [] },
};
describe('prompt-based poster creation', () => {
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
    expect(PosterReconstructionRequestSchema.safeParse({ ...request, creation: { ...request.creation, referenceId: 10 } }).success).toBe(false);
    expect(PosterReconstructionRequestSchema.safeParse({ ...request, creation: { ...request.creation, assets: [{ role: 'person', dataUrl: 'https://example.com/unsafe', width: 100, height: 100 }] } }).success).toBe(false);
  });
  it('loads the editorial theme family', () => {
    const selected = { ...request, creation: { ...request.creation!, referenceId: 9 } };
    expect(PosterReconstructionRequestSchema.safeParse(selected).success).toBe(true);
    expect(posterCreationPrompt(selected)).toContain('church-service-009');
    expect(posterCreationPrompt(selected)).toContain('red word circles');
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
