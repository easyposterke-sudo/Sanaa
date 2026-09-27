import type { PosterReconstructionPlan, ReconstructionFontCatalog } from '../../../shared/ai/posterReconstruction';
import { isProtectedReferenceElement } from '../../../shared/ai/referenceReconstructionContract';
import { requestPosterReconstruction } from '../services/posterReconstructionApi';
import { renderReferenceDraft } from './renderReferenceDraft';
import { canvasPixels, compareReferencePixels, isReferenceImprovement, loadReferencePixels, referenceComparisonRegions } from './referenceComparison';
import type { CompiledPosterReconstruction } from './compilePosterReconstruction';

/** At most one review request; never applies a candidate before checking its actual pixels. */
export async function reviewReferenceDraft(input: {
  plan: PosterReconstructionPlan;
  draft: CompiledPosterReconstruction;
  reference: { dataUrl: string; width: number; height: number };
  fontCatalog?: ReconstructionFontCatalog;
  compile: (plan: PosterReconstructionPlan) => Promise<CompiledPosterReconstruction>;
}): Promise<CompiledPosterReconstruction> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      review(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('Reference review reached its time limit.')); }, 120_000); }),
    ]);
  } catch (error) {
    return { ...input.draft, warnings: [...input.draft.warnings, `${error instanceof Error ? error.message : 'Reference review could not finish.'} The first draft was kept.`] };
  } finally {
    controller.abort(); clearTimeout(timeout);
  }

  async function review(): Promise<CompiledPosterReconstruction> {
    const surface = await renderReferenceDraft(input.draft.project);
    if (controller.signal.aborted) throw new Error('Reference review stopped.');
    const source = await loadReferencePixels(input.reference.dataUrl, surface.width, surface.height);
    if (controller.signal.aborted) throw new Error('Reference review stopped.');
    const initialPixels = canvasPixels(surface);
    const protectedLayers = input.plan.elements.filter(isProtectedReferenceElement);
    const initial = compareReferencePixels(source, initialPixels, input.plan.elements, protectedLayers);
    if (!initial.regions.length) return input.draft;
    const reviewed = await requestPosterReconstruction({
      reference: input.reference, quality: 'quality', forceFresh: true,
      ...(input.fontCatalog ? { fontCatalog: input.fontCatalog } : {}),
      referenceReview: {
        previousPlan: input.plan, draftDataUrl: surface.toDataURL('image/webp', 0.9),
        feedback: [...initial.regions].sort((a, b) => b.error - a.error).slice(0, 15).map(region => `Inspect ${region.key}: measured color/edge error ${region.error.toFixed(4)}. Preserve wording; inspect bounds, font, spacing, rotation, paths and effects. Photo differences may be intentional.`),
      },
    }, { timeoutMs: 95_000, signal: controller.signal });
    if (controller.signal.aborted) throw new Error('Reference review stopped.');
    // Client-side guard as well as server validation: immutable assets and wording.
    for (const old of input.plan.elements) {
      const next = reviewed.plan.elements.find(item => item.key === old.key);
      if (!next || (isProtectedReferenceElement(old) && JSON.stringify(next) !== JSON.stringify(old)) || (old.kind === 'text' && (next.kind !== 'text' || next.text !== old.text))) throw new Error('Reference review did not preserve protected content.');
    }
    const candidate = await input.compile(reviewed.plan);
    if (controller.signal.aborted) throw new Error('Reference review stopped.');
    const rendered = await renderReferenceDraft(candidate.project);
    if (controller.signal.aborted) throw new Error('Reference review stopped.');
    const regions = referenceComparisonRegions(input.plan, reviewed.plan);
    const before = compareReferencePixels(source, initialPixels, regions, protectedLayers);
    const after = compareReferencePixels(source, canvasPixels(rendered), regions, protectedLayers);
    return isReferenceImprovement(before, after)
      ? { ...candidate, warnings: [...candidate.warnings, 'Reference review improved the measured vector/text match. Please verify small wording and fonts.'] }
      : { ...input.draft, warnings: [...input.draft.warnings, 'Reference review found no measured improvement; the first draft was kept.'] };
  }
}
