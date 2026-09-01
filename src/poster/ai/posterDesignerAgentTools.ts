import type {
  PosterDesignerElementSummary,
  PosterDesignerOperation,
  PosterDesignerValidationIssue,
} from '../../../shared/ai/posterDesignerAgent';
import type { TemplatePosterSemanticRole } from '../../../shared/ai/templatePoster';
import { getFabricCanvasRef } from '../canvasRef';
import type { PosterTemplateFieldBinding } from '../templateTypes';
import type { PosterElement, PosterProject, PosterShapeElement, PosterTextElement } from '../types';
import { generateElementId } from '../utils/generateElementId';
import { inferTemplateFieldSemanticRole } from './templateFieldCatalog';

export type PosterDesignerToolResult = {
  project: PosterProject;
  fieldBindings: PosterTemplateFieldBinding[];
  appliedOperationIds: string[];
  skipped: Array<{ operationId: string; reason: string }>;
};

export function applyPosterDesignerOperations(
  project: PosterProject,
  fieldBindings: readonly PosterTemplateFieldBinding[],
  operations: readonly PosterDesignerOperation[],
): PosterDesignerToolResult {
  const elements = project.elements.map((element) => ({ ...element })) as PosterElement[];
  const bindings = fieldBindings.map((binding) => ({ ...binding }));
  const appliedOperationIds: string[] = [];
  const skipped: Array<{ operationId: string; reason: string }> = [];
  const seenOperationIds = new Set<string>();

  for (const operation of operations.slice(0, 20)) {
    if (seenOperationIds.has(operation.id)) {
      skipped.push({ operationId: operation.id, reason: 'Duplicate operation id.' });
      continue;
    }
    seenOperationIds.add(operation.id);

    if (operation.kind === 'add_text') {
      const text = operation.text?.trim();
      const box = operation.box;
      if (!text || !box) {
        skipped.push({ operationId: operation.id, reason: 'Missing text or layout box.' });
        continue;
      }
      const id = generateElementId();
      const role = operation.semanticRole ?? 'other';
      const zIndex = Math.max(0, ...elements.map((element) => element.zIndex)) + 1;
      const textElement: PosterTextElement = {
        id,
        type: 'text',
        layerName: `Agent: ${humanizeRole(role)}`,
        left: box.x * project.canvasWidth,
        top: box.y * project.canvasHeight,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        opacity: 1,
        zIndex,
        text,
        width: Math.max(80, box.width * project.canvasWidth),
        fontSize: Math.max(12, (operation.fontSizeRatio ?? defaultFontSizeRatio(role)) * project.canvasHeight),
        fontFamily: operation.fontFamily ?? defaultFontFamily(role),
        fontWeight: operation.fontWeight ?? defaultFontWeight(role),
        fontStyle: 'normal',
        fill: operation.fill ?? '#ffffff',
        textAlign: operation.textAlign ?? 'center',
        lineHeight: 1.05,
        charSpacing: 0,
      };
      elements.push(textElement);
      bindings.push({
        key: uniqueAgentFieldKey(bindings, role),
        label: humanizeRole(role),
        sourceElementId: id,
        kind: 'text',
      });
      appliedOperationIds.push(operation.id);
      continue;
    }

    if (operation.kind === 'add_panel') {
      const box = operation.box;
      if (!box || !operation.fill) {
        skipped.push({ operationId: operation.id, reason: 'Missing panel box or fill.' });
        continue;
      }
      const anchor = operation.elementId
        ? elements.find((element) => element.id === operation.elementId)
        : undefined;
      const width = box.width * project.canvasWidth;
      const height = box.height * project.canvasHeight;
      const panel: PosterShapeElement = {
        id: generateElementId(),
        type: 'rect',
        layerName: 'Agent: information panel',
        left: box.x * project.canvasWidth,
        top: box.y * project.canvasHeight,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        opacity: 1,
        zIndex: anchor
          ? anchor.zIndex - 0.25
          : Math.max(0, ...elements.map((element) => element.zIndex)) + 1,
        fill: operation.fill,
        fillOpacity: operation.fillOpacity ?? 0.82,
        width,
        height,
        rx: Math.min(width, height) * (operation.cornerRadiusRatio ?? 0.12),
      };
      elements.push(panel);
      appliedOperationIds.push(operation.id);
      continue;
    }

    const index = elements.findIndex((element) => element.id === operation.elementId);
    if (index < 0) {
      skipped.push({ operationId: operation.id, reason: 'Target element is unavailable.' });
      continue;
    }
    const element = elements[index]!;
    if (element.locked) {
      skipped.push({ operationId: operation.id, reason: 'Target element is locked.' });
      continue;
    }

    if (operation.kind === 'bring_to_front') {
      elements[index] = {
        ...element,
        zIndex: Math.max(0, ...elements.map((candidate) => candidate.zIndex)) + 1,
      };
      appliedOperationIds.push(operation.id);
      continue;
    }

    if (operation.kind === 'hide_duplicate_text') {
      if (!isTextBearingElement(element)) {
        skipped.push({ operationId: operation.id, reason: 'Only duplicate text layers can be hidden.' });
        continue;
      }
      const targetCopy = canonicalTextKey(elementText(element));
      const targetRole = semanticRoleForElement(bindings, element.id);
      const survivor = elements.find((candidate) =>
        candidate.id !== element.id &&
        candidate.opacity > 0 &&
        isTextBearingElement(candidate) &&
        (
          (targetCopy.length >= 5 && canonicalTextKey(elementText(candidate)) === canonicalTextKey(elementText(element))) ||
          (targetRole !== null && targetRole !== 'other' && semanticRoleForElement(bindings, candidate.id) === targetRole)
        ),
      );
      if (!survivor) {
        skipped.push({ operationId: operation.id, reason: 'No matching visible semantic duplicate was found.' });
        continue;
      }
      elements[index] = { ...element, opacity: 0 };
      for (let bindingIndex = 0; bindingIndex < bindings.length; bindingIndex += 1) {
        if (bindings[bindingIndex]!.sourceElementId === element.id) {
          bindings[bindingIndex] = { ...bindings[bindingIndex]!, sourceElementId: survivor.id };
        }
      }
      appliedOperationIds.push(operation.id);
      continue;
    }

    if (operation.kind === 'move_resize') {
      if (!operation.box) {
        skipped.push({ operationId: operation.id, reason: 'Missing target layout box.' });
        continue;
      }
      const box = operation.box;
      const updates: Partial<PosterElement> = {
        left: box.x * project.canvasWidth,
        top: box.y * project.canvasHeight,
      };
      if (element.type === 'text') {
        Object.assign(updates, {
          width: Math.max(80, box.width * project.canvasWidth),
          ...(operation.fontSizeRatio !== null
            ? { fontSize: Math.max(12, operation.fontSizeRatio * project.canvasHeight) }
            : {}),
        });
      } else if (isShapeWithDimensions(element)) {
        const baseWidth = element.width ?? (element.radius ? element.radius * 2 : undefined);
        const baseHeight = element.height ?? (element.ry ? element.ry * 2 : baseWidth);
        if (baseWidth && baseHeight) {
          updates.scaleX = (box.width * project.canvasWidth) / baseWidth;
          updates.scaleY = (box.height * project.canvasHeight) / baseHeight;
        }
      } else {
        const currentBounds = readFabricBounds(project.canvasWidth, project.canvasHeight).get(element.id);
        if (currentBounds) {
          updates.scaleX = element.scaleX * ((box.width * project.canvasWidth) / currentBounds.width);
          updates.scaleY = element.scaleY * ((box.height * project.canvasHeight) / currentBounds.height);
        }
      }
      elements[index] = { ...element, ...updates } as PosterElement;
      appliedOperationIds.push(operation.id);
      continue;
    }

    if (operation.kind === 'update_text_style') {
      if (element.type !== 'text') {
        skipped.push({ operationId: operation.id, reason: 'Only text layers accept typography updates.' });
        continue;
      }
      const textElement = element as PosterTextElement;
      elements[index] = {
        ...textElement,
        ...(operation.fontFamily ? { fontFamily: operation.fontFamily } : {}),
        ...(operation.fontSizeRatio !== null
          ? { fontSize: Math.max(12, operation.fontSizeRatio * project.canvasHeight) }
          : {}),
        ...(operation.fontWeight ? { fontWeight: operation.fontWeight } : {}),
        ...(operation.textAlign ? { textAlign: operation.textAlign } : {}),
        ...(operation.fill ? { fill: operation.fill } : {}),
        ...(operation.box
          ? {
              left: operation.box.x * project.canvasWidth,
              top: operation.box.y * project.canvasHeight,
              width: Math.max(80, operation.box.width * project.canvasWidth),
            }
          : {}),
      };
      appliedOperationIds.push(operation.id);
      continue;
    }
  }

  return {
    project: { ...project, elements: normalizeZIndexes(elements) },
    fieldBindings: bindings,
    appliedOperationIds,
    skipped,
  };
}

export function collectPosterDesignerElementSummaries(
  project: PosterProject,
  fieldBindings: readonly PosterTemplateFieldBinding[],
): PosterDesignerElementSummary[] {
  const roleByElementId = new Map<string, TemplatePosterSemanticRole>();
  for (const binding of fieldBindings) {
    roleByElementId.set(
      binding.sourceElementId,
      inferTemplateFieldSemanticRole(binding.key, binding.label),
    );
  }
  const fabricBounds = readFabricBounds(project.canvasWidth, project.canvasHeight);
  return project.elements
    .filter((element) => element.opacity > 0 && !element.excludeFromExport)
    .slice(0, 120)
    .map((element) => {
      const bounds = fabricBounds.get(element.id) ?? fallbackBounds(element, project);
      const text = element.type === 'text'
        ? element.text
        : element.type === '3d-text'
          ? element.config.text?.content ?? null
          : null;
      return {
        id: element.id,
        type: element.type,
        semanticRole: roleByElementId.get(element.id) ?? null,
        text: text?.trim().slice(0, 500) || null,
        box: normalizeBounds(bounds, project.canvasWidth, project.canvasHeight),
        fontSizeRatio: element.type === 'text' ? element.fontSize / project.canvasHeight : null,
        fill: element.type === 'text' && typeof element.fill === 'string' ? element.fill : null,
        zIndex: element.zIndex,
        agentCreated: element.layerName?.startsWith('Agent:') ?? false,
        locked: element.locked ?? false,
      };
    });
}

export function validatePosterDesignerLayout(
  project: PosterProject,
  summaries: readonly PosterDesignerElementSummary[],
  expectedFacts: readonly TemplatePosterSemanticRole[],
): PosterDesignerValidationIssue[] {
  const issues: PosterDesignerValidationIssue[] = [];
  for (const element of summaries) {
    const { x, y, width, height } = element.box;
    if (x < 0.015 || y < 0.015 || x + width > 0.985 || y + height > 0.985) {
      issues.push({
        code: 'out_of_bounds',
        severity: 'error',
        elementIds: [element.id],
        message: 'An element crosses the poster safe margin.',
      });
    }
    if (element.type === 'text' && element.text && (element.fontSizeRatio ?? 1) < 0.014) {
      issues.push({
        code: 'text_too_small',
        severity: 'warning',
        elementIds: [element.id],
        message: 'A text layer may be too small for normal poster viewing.',
      });
    }
  }

  const textElements = summaries.filter((element) => Boolean(element.text));
  for (let leftIndex = 0; leftIndex < textElements.length; leftIndex += 1) {
    const left = textElements[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < textElements.length; rightIndex += 1) {
      const right = textElements[rightIndex]!;
      const overlap = overlapRatio(left.box, right.box);
      if (overlap > 0.08) {
        issues.push({
          code: 'text_overlap',
          severity: 'error',
          elementIds: [left.id, right.id],
          message: 'Two text layers substantially overlap.',
        });
      }
      if (overlap === 0 && crowdedEdgeGap(left.box, right.box)) {
        issues.push({
          code: 'crowded_spacing',
          severity: 'warning',
          elementIds: [left.id, right.id],
          message: 'Two text blocks have too little breathing room and should be regrouped or moved.',
        });
      }
    }
  }

  const firstByText = new Map<string, string>();
  for (const element of textElements) {
    const normalized = canonicalTextKey(element.text!);
    if (normalized.length < 5) continue;
    const first = firstByText.get(normalized);
    if (first) {
      issues.push({
        code: 'duplicate_text',
        severity: 'warning',
        elementIds: [first, element.id],
        message: 'The same poster copy appears more than once.',
      });
    } else {
      firstByText.set(normalized, element.id);
    }
  }

  const firstByRole = new Map<TemplatePosterSemanticRole, PosterDesignerElementSummary>();
  for (const element of textElements) {
    const role = element.semanticRole;
    if (role !== 'title' && role !== 'theme') continue;
    const first = firstByRole.get(role);
    if (first) {
      issues.push({
        code: 'duplicate_semantic_role',
        severity: role === 'title' || role === 'theme' ? 'error' : 'warning',
        elementIds: [first.id, element.id],
        message: `More than one visible text layer represents the poster ${humanizeRole(role).toLowerCase()}. Keep one intentional treatment.`,
      });
    } else {
      firstByRole.set(role, element);
    }
  }

  const titleSize = Math.max(
    0,
    ...textElements
      .filter((element) => element.semanticRole === 'title')
      .map((element) => element.fontSizeRatio ?? 0),
  );
  for (const element of textElements) {
    const size = element.fontSizeRatio ?? 0;
    const role = element.semanticRole;
    const isMetadata = role && ['date', 'day', 'time', 'venue', 'contact', 'phone', 'website', 'email'].includes(role);
    const overAbsoluteLimit = role !== 'title' && size > (role === 'theme' ? 0.065 : 0.05);
    const overTitle = titleSize > 0 && role !== 'title' && size > titleSize * (role === 'theme' ? 0.9 : 0.68);
    if (overAbsoluteLimit || (isMetadata && overTitle)) {
      issues.push({
        code: 'weak_hierarchy',
        severity: 'warning',
        elementIds: [element.id],
        message: 'Supporting copy is competing with the main title and should be reduced or regrouped.',
      });
    }
  }

  const presentRoles = new Set(
    summaries
      .filter((element) => Boolean(element.text))
      .map((element) => element.semanticRole)
      .filter((role): role is TemplatePosterSemanticRole => role !== null),
  );
  for (const role of new Set(expectedFacts)) {
    if (role === 'other' || role === 'extra_details' || presentRoles.has(role)) continue;
    issues.push({
      code: 'missing_fact',
      severity: 'error',
      elementIds: [],
      message: `The supplied ${humanizeRole(role).toLowerCase()} is not represented by a semantic text layer.`,
    });
  }

  const background = project.canvasBackground?.type === 'solid'
    ? project.canvasBackground.color
    : project.canvasBackgroundColor;
  if (background) {
    for (const element of textElements) {
      if (!element.fill) continue;
      const contrast = contrastRatio(element.fill, background);
      if (contrast !== null && contrast < 2.5) {
        issues.push({
          code: 'low_contrast',
          severity: 'warning',
          elementIds: [element.id],
          message: 'A text layer has weak contrast against the solid canvas background.',
        });
      }
    }
  }

  return dedupeIssues(issues).slice(0, 80);
}

function readFabricBounds(canvasWidth: number, canvasHeight: number): Map<string, Bounds> {
  const canvas = getFabricCanvasRef();
  const bounds = new Map<string, Bounds>();
  if (!canvas) return bounds;
  for (const object of canvas.getObjects()) {
    const id = (object as { data?: { posterId?: string } }).data?.posterId;
    if (!id) continue;
    const box = object.getBoundingRect();
    bounds.set(id, {
      left: clamp(box.left, -canvasWidth, canvasWidth * 2),
      top: clamp(box.top, -canvasHeight, canvasHeight * 2),
      width: clamp(box.width, 1, canvasWidth * 3),
      height: clamp(box.height, 1, canvasHeight * 3),
    });
  }
  return bounds;
}

type Bounds = { left: number; top: number; width: number; height: number };

function fallbackBounds(element: PosterElement, project: PosterProject): Bounds {
  if (element.type === 'text') {
    const lines = Math.max(1, element.text.split(/\r?\n/).length);
    return {
      left: element.left,
      top: element.top,
      width: (element.width ?? 200) * Math.abs(element.scaleX),
      height: element.fontSize * (element.lineHeight ?? 1.16) * lines * Math.abs(element.scaleY),
    };
  }
  if (isShapeWithDimensions(element)) {
    const width = element.width ?? (element.radius ? element.radius * 2 : project.canvasWidth * 0.1);
    const height = element.height ?? (element.ry ? element.ry * 2 : width);
    return {
      left: element.left,
      top: element.top,
      width: width * Math.abs(element.scaleX),
      height: height * Math.abs(element.scaleY),
    };
  }
  return {
    left: element.left,
    top: element.top,
    width: project.canvasWidth * 0.18 * Math.abs(element.scaleX),
    height: project.canvasHeight * 0.18 * Math.abs(element.scaleY),
  };
}

function normalizeBounds(bounds: Bounds, canvasWidth: number, canvasHeight: number) {
  return {
    x: clamp(bounds.left / canvasWidth, 0, 1),
    y: clamp(bounds.top / canvasHeight, 0, 1),
    width: clamp(bounds.width / canvasWidth, 0.03, 1),
    height: clamp(bounds.height / canvasHeight, 0.02, 1),
  };
}

function isShapeWithDimensions(element: PosterElement): element is PosterShapeElement {
  return ['rect', 'circle', 'triangle', 'ellipse', 'line', 'polygon'].includes(element.type);
}

function isTextBearingElement(element: PosterElement): boolean {
  return element.type === 'text' || element.type === '3d-text';
}

function elementText(element: PosterElement): string {
  if (element.type === 'text') return element.text;
  if (element.type === '3d-text') return element.config.text?.content ?? '';
  return '';
}

function semanticRoleForElement(
  bindings: readonly PosterTemplateFieldBinding[],
  elementId: string,
): TemplatePosterSemanticRole | null {
  const binding = bindings.find((candidate) => candidate.sourceElementId === elementId);
  return binding ? inferTemplateFieldSemanticRole(binding.key, binding.label) : null;
}

function normalizeZIndexes(elements: PosterElement[]): PosterElement[] {
  const ordered = [...elements].sort((left, right) => left.zIndex - right.zIndex);
  const zIndexById = new Map(ordered.map((element, index) => [element.id, index + 1]));
  return elements.map((element) => ({ ...element, zIndex: zIndexById.get(element.id) ?? element.zIndex })) as PosterElement[];
}

function uniqueAgentFieldKey(
  bindings: readonly PosterTemplateFieldBinding[],
  role: TemplatePosterSemanticRole,
): string {
  const root = `agent_${role}`.slice(0, 80);
  const keys = new Set(bindings.map((binding) => binding.key));
  if (!keys.has(root)) return root;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${root}_${index}`;
    if (!keys.has(candidate)) return candidate;
  }
  return `agent_field_${bindings.length + 1}`;
}

function humanizeRole(role: TemplatePosterSemanticRole): string {
  return role.replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
}

function defaultFontSizeRatio(role: TemplatePosterSemanticRole): number {
  if (role === 'title') return 0.07;
  if (role === 'theme') return 0.04;
  if (role === 'person_name' || role === 'organization') return 0.032;
  return 0.024;
}

function defaultFontFamily(role: TemplatePosterSemanticRole): PosterTextElement['fontFamily'] {
  return role === 'title' ? 'Arial Black' : 'Inter';
}

function defaultFontWeight(role: TemplatePosterSemanticRole): PosterTextElement['fontWeight'] {
  return role === 'title' || role === 'theme' ? '800' : '600';
}

function overlapRatio(left: PosterDesignerElementSummary['box'], right: PosterDesignerElementSummary['box']): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  const intersection = width * height;
  if (intersection === 0) return 0;
  return intersection / Math.max(0.0001, Math.min(left.width * left.height, right.width * right.height));
}

function crowdedEdgeGap(
  left: PosterDesignerElementSummary['box'],
  right: PosterDesignerElementSummary['box'],
): boolean {
  const horizontalOverlap = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const verticalOverlap = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  const horizontalGap = Math.max(0, Math.max(left.x, right.x) - Math.min(left.x + left.width, right.x + right.width));
  const verticalGap = Math.max(0, Math.max(left.y, right.y) - Math.min(left.y + left.height, right.y + right.height));
  const alignedVertically = horizontalOverlap > Math.min(left.width, right.width) * 0.35;
  const alignedHorizontally = verticalOverlap > Math.min(left.height, right.height) * 0.35;
  return (alignedVertically && verticalGap > 0 && verticalGap < 0.012) ||
    (alignedHorizontally && horizontalGap > 0 && horizontalGap < 0.012);
}

function canonicalTextKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .sort()
    .join(' ');
}

function contrastRatio(foreground: string, background: string): number | null {
  const left = relativeLuminance(foreground);
  const right = relativeLuminance(background);
  if (left === null || right === null) return null;
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

function relativeLuminance(color: string): number | null {
  const match = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(match[1]!.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function dedupeIssues(issues: PosterDesignerValidationIssue[]): PosterDesignerValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${[...issue.elementIds].sort().join(',')}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
