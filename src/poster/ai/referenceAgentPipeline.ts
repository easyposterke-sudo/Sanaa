import type { PosterDesignerElementSummary } from '../../../shared/ai/posterDesignerAgent';
import type { PosterReconstructionPlan, ReconstructionElement } from '../../../shared/ai/posterReconstruction';
import type { PosterTemplateFieldBinding } from '../templateTypes';
import type { PosterProject } from '../types';
import { inferVisibleTextSemanticRole } from './templateFieldCatalog';

export interface ReferenceFieldAnchor {
  box: ReconstructionElement['box'];
  textAlign: 'left' | 'center' | 'right';
}

export function annotateReferencePlan(plan: PosterReconstructionPlan): PosterReconstructionPlan {
  const usedFieldKeys = new Set<string>();
  const themeCandidate = plan.elements
    .filter((element) => element.kind === 'text' && element.box.y >= 0.35 && element.box.y <= 0.72)
    .filter((element) => element.box.width >= 0.42 && element.box.height <= 0.12)
    .sort((left, right) => Math.abs((left.box.y + left.box.height / 2) - 0.52) - Math.abs((right.box.y + right.box.height / 2) - 0.52))[0];
  const elements = plan.elements.map((element) => {
    if (element.kind === 'text') {
      let role = inferVisibleTextSemanticRole(element.text, element.fontSizeRatio, element.box.height) ?? 'other';
      if (element === themeCandidate && role === 'other') role = 'theme';
      const fieldKey = uniqueReferenceFieldKey(semanticFieldBase(role), usedFieldKeys);
      return {
        ...element,
        suggestedFieldKey: fieldKey,
        suggestedFieldLabel: semanticFieldLabel(role, element.label),
      };
    }
    if (element.kind === 'image_region' && ['person', 'logo'].includes(element.imageRole)) {
      const preferred = element.imageRole === 'person' ? 'person_photo' : 'logo';
      return {
        ...element,
        suggestedFieldKey: uniqueReferenceFieldKey(preferred, usedFieldKeys),
        suggestedFieldLabel: element.imageRole === 'person' ? 'Person photo' : 'Logo',
      };
    }
    return { ...element };
  });
  return { ...plan, elements };
}

export function buildReferenceFieldAnchors(plan: PosterReconstructionPlan): Record<string, ReferenceFieldAnchor> {
  return Object.fromEntries(plan.elements.flatMap((element) => element.suggestedFieldKey
    ? [[element.suggestedFieldKey, { box: { ...element.box }, textAlign: element.textAlign } satisfies ReferenceFieldAnchor]]
    : []));
}

export function stabilizeReferenceFieldLayout(
  project: PosterProject,
  bindings: readonly PosterTemplateFieldBinding[],
  summaries: readonly PosterDesignerElementSummary[],
  anchors: Readonly<Record<string, ReferenceFieldAnchor>>,
): { project: PosterProject; adjustedElementIds: string[]; skillVersion: string } {
  const elements = project.elements.map((element) => ({ ...element })) as PosterProject['elements'];
  const byId = new Map(elements.map((element) => [element.id, element]));
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
  const adjusted = new Set<string>();
  for (const binding of bindings) {
    const anchor = anchors[binding.key];
    const element = byId.get(binding.sourceElementId);
    if (!anchor || !element || element.opacity <= 0) continue;
    const targetLeft = anchor.box.x * project.canvasWidth;
    const targetTop = anchor.box.y * project.canvasHeight;
    if (element.type === 'text') {
      let changed = Math.abs(element.left - targetLeft) > 0.5 || Math.abs(element.top - targetTop) > 0.5 || Math.abs((element.width ?? 0) - anchor.box.width * project.canvasWidth) > 0.5 || element.textAlign !== anchor.textAlign;
      const summary = summaryById.get(element.id);
      if (summary) {
        const fit = Math.min(
          1,
          anchor.box.width / Math.max(0.001, summary.box.width),
          anchor.box.height / Math.max(0.001, summary.box.height),
        );
        if (fit < 0.995) {
          element.fontSize = Math.max(6, element.fontSize * fit * 0.96);
          changed = true;
        }
      }
      element.left = targetLeft;
      element.top = targetTop;
      element.width = Math.max(12, anchor.box.width * project.canvasWidth);
      element.textAlign = anchor.textAlign;
      if (changed) adjusted.add(element.id);
    } else if (element.type === '3d-text') {
      const changed = Math.abs(element.left - targetLeft) > 0.5 || Math.abs(element.top - targetTop) > 0.5;
      element.left = targetLeft;
      element.top = targetTop;
      if (changed) adjusted.add(element.id);
    }
  }
  for (const summary of summaries.filter((item) => item.agentCreated && !bindings.some((binding) => binding.sourceElementId === item.id))) {
    const element = byId.get(summary.id);
    if (!element || element.locked) continue;
    const safeX = clamp(summary.box.x, 0.04, 0.96 - Math.min(summary.box.width, 0.92));
    const safeY = clamp(summary.box.y, 0.04, 0.96 - Math.min(summary.box.height, 0.92));
    if (Math.abs(safeX - summary.box.x) > 0.001 || Math.abs(safeY - summary.box.y) > 0.001) {
      element.left += (safeX - summary.box.x) * project.canvasWidth;
      element.top += (safeY - summary.box.y) * project.canvasHeight;
      adjusted.add(element.id);
    }
  }
  return {
    project: { ...project, elements },
    adjustedElementIds: [...adjusted],
    skillVersion: 'reference-layout-lock/1.0.0',
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function semanticFieldBase(role: ReturnType<typeof inferVisibleTextSemanticRole> | 'other'): string {
  switch (role) {
    case 'title': return 'event_title';
    case 'organization': return 'organization';
    case 'person_name': return 'person_name';
    case 'theme': return 'theme';
    case 'date': return 'date';
    case 'day': return 'day';
    case 'time': return 'time';
    case 'venue': return 'venue';
    case 'contact': return 'contact';
    case 'phone': return 'phone';
    case 'website': return 'website';
    case 'email': return 'email';
    case 'tagline': return 'tagline';
    case 'extra_details': return 'extra_details';
    default: return 'reference_text';
  }
}

function semanticFieldLabel(
  role: ReturnType<typeof inferVisibleTextSemanticRole> | 'other',
  fallback: string,
): string {
  if (!role || role === 'other') return fallback || 'Reference text';
  return role.split('_').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function uniqueReferenceFieldKey(preferred: string, used: Set<string>): string {
  const base = preferred.replace(/[^a-z0-9_]/g, '_').replace(/^([^a-z])/, 'field_$1').slice(0, 40) || 'field';
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 43)}_${index}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}
