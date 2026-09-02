import {
  PosterCreativeCompositionSchema,
  type CreativeLayoutGroup,
  type PosterCreativeComposition,
} from '../../../shared/ai/posterCreativeAgent';
import {
  PosterReconstructionPlanSchema,
  type PosterReconstructionPlan,
  type ReconstructionElement,
} from '../../../shared/ai/posterReconstruction';
import {
  compilePosterReconstruction,
  type CompiledPosterReconstruction,
  type ReconstructionImageReplacement,
} from './compilePosterReconstruction';

export const CREATIVE_CONSTRAINT_COMPILER_VERSION = 'creative-constraint-compiler/1.0.0' as const;

const SAFE_MARGIN = 0.04;
const BLANK_REFERENCE = {
  dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL8WQAAAABJRU5ErkJggg==',
  width: 1,
  height: 1,
};

export interface CreativeCompilationResult extends CompiledPosterReconstruction {
  constraintWarnings: string[];
  constraintAdjustments: number;
  constraintCompilerVersion: typeof CREATIVE_CONSTRAINT_COMPILER_VERSION;
}

export async function compileCreativePoster(input: {
  composition: PosterCreativeComposition;
  canvasSize: { width: number; height: number };
  reference?: { dataUrl: string; width: number; height: number } | null;
  imageReplacements?: Readonly<Record<string, ReconstructionImageReplacement>>;
}): Promise<CreativeCompilationResult> {
  const composition = PosterCreativeCompositionSchema.parse(input.composition);
  const constrained = constrainCreativePlan(composition);
  const compiled = await compilePosterReconstruction({
    plan: constrained.plan,
    reference: input.reference ?? BLANK_REFERENCE,
    canvasSize: input.canvasSize,
    referenceGuideOpacity: 0,
    imageReplacements: input.imageReplacements,
  });
  return {
    ...compiled,
    warnings: [...compiled.warnings, ...constrained.warnings],
    constraintWarnings: constrained.warnings,
    constraintAdjustments: constrained.adjustments,
    constraintCompilerVersion: CREATIVE_CONSTRAINT_COMPILER_VERSION,
  };
}

export function constrainCreativePlan(compositionInput: PosterCreativeComposition): {
  plan: PosterReconstructionPlan;
  warnings: string[];
  adjustments: number;
} {
  const composition = PosterCreativeCompositionSchema.parse(compositionInput);
  const elements = composition.plan.elements.map((element) => ({
    ...element,
    box: { ...element.box },
    pathPoints: element.pathPoints.map((point) => ({ ...point })),
  }));
  const byKey = new Map(elements.map((element) => [element.key, element]));
  const warnings: string[] = [];
  let adjustments = 0;

  for (const element of elements) {
    if (element.kind === 'text' || element.kind === 'image_region') {
      adjustments += clampElementToSafeArea(element);
    }
  }

  const groups = [...composition.groups].sort((left, right) => right.priority - left.priority);
  for (const group of groups) {
    const members = group.elementKeys.map((key) => byKey.get(key)).filter(isDefined);
    if (members.length === 0) continue;
    adjustments += applyGroupConstraints(group, members);
  }

  for (const exclusion of composition.exclusions) {
    const obstacle = byKey.get(exclusion.elementKey);
    if (!obstacle) continue;
    const obstacleBox = expandBox(obstacle.box, exclusion.paddingRatio);
    for (const groupId of exclusion.protectedGroupIds) {
      const group = groups.find((candidate) => candidate.id === groupId);
      if (!group) continue;
      const members = group.elementKeys.map((key) => byKey.get(key)).filter(isDefined);
      if (members.length === 0 || !boxesOverlap(unionBox(members), obstacleBox)) continue;
      const moved = moveGroupAwayFromObstacle(members, group, obstacleBox);
      adjustments += moved;
      if (moved === 0 && boxesOverlap(unionBox(members), obstacleBox)) {
        warnings.push(`The ${group.label} group could not be fully separated from ${obstacle.label}.`);
      }
    }
  }

  for (const group of groups) {
    const members = group.elementKeys.map((key) => byKey.get(key)).filter(isDefined);
    if (members.length > 0) adjustments += applyAxisAlignment(group, members);
  }

  return {
    plan: PosterReconstructionPlanSchema.parse({ ...composition.plan, elements }),
    warnings,
    adjustments,
  };
}

function applyGroupConstraints(group: CreativeLayoutGroup, members: ReconstructionElement[]): number {
  if (group.direction === 'free') return applyAxisAlignment(group, members);
  const region = insetToSafeArea(group.region);
  const gap = group.gapRatio;
  let adjustments = 0;
  if (group.direction === 'column') {
    const totalHeight = members.reduce((sum, item) => sum + Math.min(item.box.height, region.height), 0);
    const actualGap = members.length > 1
      ? Math.max(0, Math.min(gap, (region.height - totalHeight) / (members.length - 1)))
      : 0;
    const contentHeight = totalHeight + actualGap * Math.max(0, members.length - 1);
    let cursor = region.y + Math.max(0, (region.height - contentHeight) / 2);
    for (const member of members) {
      const height = Math.min(member.box.height, region.height);
      const width = Math.min(member.box.width, region.width);
      adjustments += setBox(member, {
        x: alignedX(group.align, region, width),
        y: cursor,
        width,
        height,
      });
      cursor += height + actualGap;
    }
  } else {
    const totalWidth = members.reduce((sum, item) => sum + Math.min(item.box.width, region.width), 0);
    const actualGap = members.length > 1
      ? Math.max(0, Math.min(gap, (region.width - totalWidth) / (members.length - 1)))
      : 0;
    const contentWidth = totalWidth + actualGap * Math.max(0, members.length - 1);
    let cursor = region.x + Math.max(0, (region.width - contentWidth) / 2);
    const opticalCenter = region.y + region.height / 2;
    for (const member of members) {
      const width = Math.min(member.box.width, region.width);
      const height = Math.min(member.box.height, region.height);
      adjustments += setBox(member, {
        x: cursor,
        y: clamp(opticalCenter - height / 2, region.y, region.y + region.height - height),
        width,
        height,
      });
      cursor += width + actualGap;
    }
  }
  return adjustments;
}

function applyAxisAlignment(group: CreativeLayoutGroup, members: ReconstructionElement[]): number {
  const region = insetToSafeArea(group.region);
  let adjustments = 0;
  for (const member of members) {
    const width = Math.min(member.box.width, region.width);
    const nextX = alignedX(group.align, region, width);
    if (Math.abs(member.box.x - nextX) > 0.0001 || Math.abs(member.box.width - width) > 0.0001) {
      member.box.x = nextX;
      member.box.width = width;
      adjustments += 1;
    }
  }
  return adjustments;
}

function moveGroupAwayFromObstacle(
  members: ReconstructionElement[],
  group: CreativeLayoutGroup,
  obstacle: ReconstructionElement['box'],
): number {
  const bounds = unionBox(members);
  const region = insetToSafeArea(group.region);
  const leftShift = obstacle.x - bounds.width - group.gapRatio - bounds.x;
  const rightShift = obstacle.x + obstacle.width + group.gapRatio - bounds.x;
  const candidates = [leftShift, rightShift]
    .map((shift) => ({ shift, x: bounds.x + shift }))
    .filter((candidate) => candidate.x >= region.x && candidate.x + bounds.width <= region.x + region.width)
    .sort((left, right) => Math.abs(left.shift) - Math.abs(right.shift));
  const candidate = candidates[0];
  if (!candidate) return 0;
  for (const member of members) member.box.x += candidate.shift;
  return members.length;
}

function clampElementToSafeArea(element: ReconstructionElement): number {
  const width = Math.min(element.box.width, 1 - SAFE_MARGIN * 2);
  const height = Math.min(element.box.height, 1 - SAFE_MARGIN * 2);
  const next = {
    x: clamp(element.box.x, SAFE_MARGIN, 1 - SAFE_MARGIN - width),
    y: clamp(element.box.y, SAFE_MARGIN, 1 - SAFE_MARGIN - height),
    width,
    height,
  };
  return setBox(element, next);
}

function insetToSafeArea(box: ReconstructionElement['box']): ReconstructionElement['box'] {
  const x = clamp(box.x, SAFE_MARGIN, 1 - SAFE_MARGIN);
  const y = clamp(box.y, SAFE_MARGIN, 1 - SAFE_MARGIN);
  return {
    x,
    y,
    width: Math.max(0.03, Math.min(box.width, 1 - SAFE_MARGIN - x)),
    height: Math.max(0.03, Math.min(box.height, 1 - SAFE_MARGIN - y)),
  };
}

function alignedX(align: CreativeLayoutGroup['align'], region: ReconstructionElement['box'], width: number): number {
  if (align === 'right') return region.x + region.width - width;
  if (align === 'center') return region.x + (region.width - width) / 2;
  return region.x;
}

function setBox(element: ReconstructionElement, next: ReconstructionElement['box']): number {
  const changed = Math.abs(element.box.x - next.x) > 0.0001 || Math.abs(element.box.y - next.y) > 0.0001 || Math.abs(element.box.width - next.width) > 0.0001 || Math.abs(element.box.height - next.height) > 0.0001;
  element.box = next;
  return changed ? 1 : 0;
}

function expandBox(box: ReconstructionElement['box'], amount: number): ReconstructionElement['box'] {
  return { x: box.x - amount, y: box.y - amount, width: box.width + amount * 2, height: box.height + amount * 2 };
}

function unionBox(elements: ReconstructionElement[]): ReconstructionElement['box'] {
  const left = Math.min(...elements.map((item) => item.box.x));
  const top = Math.min(...elements.map((item) => item.box.y));
  const right = Math.max(...elements.map((item) => item.box.x + item.box.width));
  const bottom = Math.max(...elements.map((item) => item.box.y + item.box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function boxesOverlap(left: ReconstructionElement['box'], right: ReconstructionElement['box']): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
