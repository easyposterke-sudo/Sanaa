import { createFallbackReconstructionPlan, type ReconstructionElement } from '../../../shared/ai/posterReconstruction';
import { expandReferenceElement } from '../../../shared/ai/referenceReconstructionContract';

/** Small deterministic fixtures shared by the reference regression suite. */
export function referenceElement(overrides: Partial<ReconstructionElement> = {}): ReconstructionElement {
  return expandReferenceElement({
    key: 'panel', kind: 'rect', label: 'Panel', box: { x: .1, y: .1, width: .8, height: .8 },
    angle: 0, opacity: 1, zIndex: 1, confidence: .9, fill: '#ffffff',
    text: 'SUNDAY', fontFamily: 'arial', fontSizeRatio: .1, pathPoints: [], pathClosed: false,
    ...overrides,
  });
}

export function referencePlan(elements = [referenceElement()]) {
  return { ...createFallbackReconstructionPlan(), summary: 'Reference fixture', elements, confidence: .9, warnings: [] };
}
