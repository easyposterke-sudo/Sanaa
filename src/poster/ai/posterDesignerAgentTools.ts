import type {
  PosterDesignerElementSummary,
  NormalizedAgentBox,
  PosterDesignerOperation,
  PosterDesignerValidationIssue,
} from '../../../shared/ai/posterDesignerAgent';
import type { TemplatePosterSemanticRole } from '../../../shared/ai/templatePoster';
import {
  POSTER_LAYOUT_METRICS,
  POSTER_LAYOUT_SKILL_VERSION,
} from '../../../shared/ai/posterLayoutSkill';
import { getFabricCanvasRef } from '../canvasRef';
import type { PosterTemplateFieldBinding } from '../templateTypes';
import type { PosterElement, PosterProject, PosterShapeElement, PosterTextElement } from '../types';
import { generateElementId } from '../utils/generateElementId';
import {
  inferTemplateFieldSemanticRole,
  inferVisibleTextSemanticRole,
} from './templateFieldCatalog';

export type PosterDesignerToolResult = {
  project: PosterProject;
  fieldBindings: PosterTemplateFieldBinding[];
  appliedOperationIds: string[];
  skipped: Array<{ operationId: string; reason: string }>;
};

export type PosterDesignerLayoutStabilization = {
  project: PosterProject;
  adjustedElementIds: string[];
  skillVersion: typeof POSTER_LAYOUT_SKILL_VERSION;
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
      const box = operation.box ? safeAgentBox(operation.box) : null;
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
        fontSize: fitTextFontSize(
          text,
          box.width * project.canvasWidth,
          box.height * project.canvasHeight,
          (operation.fontSizeRatio ?? defaultFontSizeRatio(role)) * project.canvasHeight,
        ),
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
      const box = operation.box ? safeAgentBox(operation.box) : null;
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
      const targetRole = semanticRoleForElement(bindings, element, project);
      const survivor = elements.find((candidate) =>
        candidate.id !== element.id &&
        candidate.opacity > 0 &&
        isTextBearingElement(candidate) &&
        (
          (targetCopy.length >= 5 && canonicalTextKey(elementText(candidate)) === canonicalTextKey(elementText(element))) ||
          (targetRole !== null && targetRole !== 'other' && semanticRoleForElement(bindings, candidate, project) === targetRole)
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
      const box = safeAgentBox(operation.box);
      const updates: Partial<PosterElement> = {
        left: box.x * project.canvasWidth,
        top: box.y * project.canvasHeight,
      };
      if (element.type === 'text') {
        const width = Math.max(80, box.width * project.canvasWidth);
        const requestedFontSize = operation.fontSizeRatio !== null
          ? operation.fontSizeRatio * project.canvasHeight
          : element.fontSize;
        Object.assign(updates, {
          width,
          fontSize: fitTextFontSize(
            element.text,
            width,
            box.height * project.canvasHeight,
            requestedFontSize,
          ),
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
      const safeBox = operation.box ? safeAgentBox(operation.box) : null;
      const targetWidth = safeBox
        ? Math.max(80, safeBox.width * project.canvasWidth)
        : Math.max(80, (textElement.width ?? 200) * Math.abs(textElement.scaleX));
      const requestedFontSize = operation.fontSizeRatio !== null
        ? operation.fontSizeRatio * project.canvasHeight
        : textElement.fontSize;
      elements[index] = {
        ...textElement,
        ...(operation.fontFamily ? { fontFamily: operation.fontFamily } : {}),
        ...((safeBox || operation.fontSizeRatio !== null)
          ? {
              fontSize: fitTextFontSize(
                textElement.text,
                targetWidth,
                safeBox ? safeBox.height * project.canvasHeight : project.canvasHeight * 0.3,
                requestedFontSize,
              ),
            }
          : {}),
        ...(operation.fontWeight ? { fontWeight: operation.fontWeight } : {}),
        ...(operation.textAlign ? { textAlign: operation.textAlign } : {}),
        ...(operation.fill ? { fill: operation.fill } : {}),
        ...(safeBox
          ? {
              left: safeBox.x * project.canvasWidth,
              top: safeBox.y * project.canvasHeight,
              width: targetWidth,
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
      const boundRole = roleByElementId.get(element.id) ?? null;
      const inferredRole = text
        ? inferVisibleTextSemanticRole(
            text,
            element.type === 'text' ? element.fontSize / project.canvasHeight : null,
            bounds.height / project.canvasHeight,
          )
        : null;
      return {
        id: element.id,
        type: element.type,
        semanticRole: boundRole && boundRole !== 'other' ? boundRole : inferredRole ?? boundRole,
        text: text?.trim().slice(0, 500) || null,
        box: normalizeBounds(bounds, project.canvasWidth, project.canvasHeight),
        fontSizeRatio: element.type === 'text' ? element.fontSize / project.canvasHeight : null,
        textAlign: element.type === 'text' ? element.textAlign ?? 'left' : null,
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

  const firstByFact = new Map<string, string>();
  for (const element of textElements) {
    const fingerprint = semanticFactFingerprint(element.semanticRole, element.text!);
    if (!fingerprint) continue;
    const first = firstByFact.get(fingerprint);
    if (first) {
      issues.push({
        code: 'duplicate_text',
        severity: 'warning',
        elementIds: [first, element.id],
        message: 'Two text blocks repeat the same factual content in different wording.',
      });
    } else {
      firstByFact.set(fingerprint, element.id);
    }
  }

  for (const role of ['title', 'theme'] as const) {
    const roleElements = textElements.filter((element) => element.semanticRole === role);
    const agentElements = roleElements.filter((element) => element.agentCreated);
    if (roleElements.length > 1 && agentElements.length > 0) {
      const templateElement = roleElements.find((element) => !element.agentCreated);
      issues.push({
        code: 'duplicate_semantic_role',
        severity: 'error',
        elementIds: [
          ...(templateElement ? [templateElement.id] : []),
          ...agentElements.map((element) => element.id),
        ].slice(0, 8),
        message: `Agent-added copy repeats the template's visible ${humanizeRole(role).toLowerCase()}. Keep the integrated template treatment.`,
      });
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


  issues.push(...validatePosterAlignmentAnchors(summaries));

  return dedupeIssues(issues).slice(0, 80);
}

/**
 * Last-resort geometry guard after the visual critic finishes. It only keeps
 * visible editable layers inside safe bounds and separates colliding support
 * copy; it deliberately leaves intentional template title art alone.
 */
export function stabilizePosterDesignerLayout(
  project: PosterProject,
  summaries: readonly PosterDesignerElementSummary[],
): PosterDesignerLayoutStabilization {
  const elements = project.elements.map((element) => ({ ...element })) as PosterElement[];
  const elementById = new Map(elements.map((element) => [element.id, element]));
  const boxes = new Map(summaries.map((summary) => [summary.id, { ...summary.box }]));
  const adjusted = new Set<string>();
  const margin = POSTER_LAYOUT_METRICS.safeMargin;

  for (const summary of summaries) {
    if (summary.locked) continue;
    const element = elementById.get(summary.id);
    const box = boxes.get(summary.id);
    if (!element || !box) continue;
    const scale = Math.min(1, (1 - margin * 2) / box.width, (1 - margin * 2) / box.height);
    if (scale < 0.999) {
      element.scaleX *= scale;
      element.scaleY *= scale;
      box.width *= scale;
      box.height *= scale;
      adjusted.add(element.id);
    }
    const targetX = clamp(box.x, margin, 1 - margin - box.width);
    const targetY = clamp(box.y, margin, 1 - margin - box.height);
    if (Math.abs(targetX - box.x) > 0.001 || Math.abs(targetY - box.y) > 0.001) {
      element.left += (targetX - box.x) * project.canvasWidth;
      element.top += (targetY - box.y) * project.canvasHeight;
      box.x = targetX;
      box.y = targetY;
      adjusted.add(element.id);
    }
  }

  applyDeterministicAlignmentSkill({
    project,
    summaries,
    elementById,
    boxes,
    adjusted,
  });

  const textSummaries = summaries.filter((summary) => Boolean(summary.text));
  for (let pass = 0; pass < 4; pass += 1) {
    let moved = false;
    for (let leftIndex = 0; leftIndex < textSummaries.length; leftIndex += 1) {
      const left = textSummaries[leftIndex]!;
      for (let rightIndex = leftIndex + 1; rightIndex < textSummaries.length; rightIndex += 1) {
        const right = textSummaries[rightIndex]!;
        const leftBox = boxes.get(left.id);
        const rightBox = boxes.get(right.id);
        if (!leftBox || !rightBox || overlapRatio(leftBox, rightBox) <= 0.04) continue;
        if (
          !left.agentCreated &&
          !right.agentCreated &&
          isHeroRole(left.semanticRole) &&
          isHeroRole(right.semanticRole)
        ) continue;
        const moving = chooseMovableSupportText(left, right);
        const stationary = moving.id === left.id ? right : left;
        if (moving.locked || !isSupportRole(moving.semanticRole, moving.agentCreated)) continue;
        const movingElement = elementById.get(moving.id);
        const movingBox = boxes.get(moving.id);
        const stationaryBox = boxes.get(stationary.id);
        if (!movingElement || !movingBox || !stationaryBox) continue;
        const gap = 0.015;
        const below = stationaryBox.y + stationaryBox.height + gap;
        const above = stationaryBox.y - gap - movingBox.height;
        const targetY = below + movingBox.height <= 1 - margin
          ? below
          : above >= margin
            ? above
            : null;
        if (targetY === null || Math.abs(targetY - movingBox.y) < 0.001) continue;
        movingElement.top += (targetY - movingBox.y) * project.canvasHeight;
        movingBox.y = targetY;
        adjusted.add(moving.id);
        moved = true;
      }
    }
    if (!moved) break;
  }

  return {
    project: { ...project, elements: normalizeZIndexes(elements) },
    adjustedElementIds: [...adjusted],
    skillVersion: POSTER_LAYOUT_SKILL_VERSION,
  };
}

function applyDeterministicAlignmentSkill(input: {
  project: PosterProject;
  summaries: readonly PosterDesignerElementSummary[];
  elementById: Map<string, PosterElement>;
  boxes: Map<string, PosterDesignerElementSummary['box']>;
  adjusted: Set<string>;
}): void {
  const visibleText = input.summaries.filter((summary) => Boolean(summary.text));
  const title = visibleText.filter((summary) => summary.semanticRole === 'title');
  const titleBox = unionBoxes(title.map((summary) => input.boxes.get(summary.id)).filter(isDefined));
  const titleAlignment = dominantTextAlignment(title);
  const centeredComposition = titleAlignment === 'center' || (
    titleAlignment === null && titleBox !== null && Math.abs(boxCenterX(titleBox) - 0.5) <= 0.08
  );
  const primaryAnchor = titleBox
    ? centeredComposition ? 0.5 : titleBox.x
    : 0.5;

  for (const role of ['organization', 'theme'] as const) {
    for (const summary of visibleText.filter((candidate) => candidate.semanticRole === role)) {
      if (centeredComposition) {
        alignSummaryCenterX(input, summary, primaryAnchor, 'center');
      } else if (titleBox) {
        alignSummaryLeft(input, summary, primaryAnchor, 'left');
      }
    }
  }

  const dayDate = visibleText.filter((summary) => summary.semanticRole === 'day' || summary.semanticRole === 'date');
  const times = visibleText.filter((summary) => summary.semanticRole === 'time');
  alignStackOnExistingAxis(input, dayDate);
  alignStackOnExistingAxis(input, times);

  const dayDateBox = unionBoxes(dayDate.map((summary) => input.boxes.get(summary.id)).filter(isDefined));
  const timeBox = unionBoxes(times.map((summary) => input.boxes.get(summary.id)).filter(isDefined));
  const splitLogistics = dayDateBox && timeBox &&
    Math.abs(boxCenterX(dayDateBox) - boxCenterX(timeBox)) >= 0.12 &&
    Math.abs(dayDateBox.y - timeBox.y) <= 0.16;
  if (splitLogistics && dayDateBox && timeBox) {
    const sharedTop = Math.min(dayDateBox.y, timeBox.y);
    shiftGroupY(input, dayDate, sharedTop - dayDateBox.y);
    shiftGroupY(input, times, sharedTop - timeBox.y);
  }

  const logistics = [...dayDate, ...times];
  const logisticsBox = unionBoxes(logistics.map((summary) => input.boxes.get(summary.id)).filter(isDefined));
  for (const venue of visibleText.filter((summary) => summary.semanticRole === 'venue')) {
    if (splitLogistics && dayDateBox && timeBox) {
      alignSummaryCenterX(input, venue, (boxCenterX(dayDateBox) + boxCenterX(timeBox)) / 2, 'center');
    } else if (centeredComposition) {
      alignSummaryCenterX(input, venue, primaryAnchor, 'center');
    } else if (titleBox) {
      alignSummaryLeft(input, venue, primaryAnchor, 'left');
    }
  }

  const theme = visibleText.find((summary) => summary.semanticRole === 'theme');
  if (theme && titleBox && logisticsBox) {
    const themeBox = input.boxes.get(theme.id);
    if (themeBox) {
      const earliestLogisticsY = logisticsBox.y;
      const lowerBound = titleBox.y + titleBox.height + POSTER_LAYOUT_METRICS.compactGap;
      const upperBound = earliestLogisticsY - POSTER_LAYOUT_METRICS.groupGap - themeBox.height;
      if (upperBound >= lowerBound) {
        const targetY = clamp(themeBox.y, lowerBound, upperBound);
        shiftSummary(input, theme, 0, targetY - themeBox.y);
      }
    }
  }

  alignTextInsidePanels(input, visibleText);
}

function validatePosterAlignmentAnchors(
  summaries: readonly PosterDesignerElementSummary[],
): PosterDesignerValidationIssue[] {
  const issues: PosterDesignerValidationIssue[] = [];
  const text = summaries.filter((summary) => Boolean(summary.text));
  const title = text.filter((summary) => summary.semanticRole === 'title');
  const titleBox = unionBoxes(title.map((summary) => summary.box));
  const titleAlignment = dominantTextAlignment(title);
  const centeredComposition = titleAlignment === 'center' || (
    titleAlignment === null && titleBox !== null && Math.abs(boxCenterX(titleBox) - 0.5) <= 0.08
  );
  if (titleBox) {
    const anchor = centeredComposition ? 0.5 : titleBox.x;
    for (const summary of text.filter((candidate) =>
      candidate.semanticRole === 'organization' || candidate.semanticRole === 'theme')) {
      const delta = centeredComposition
        ? Math.abs(boxCenterX(summary.box) - anchor)
        : Math.abs(summary.box.x - anchor);
      if (delta > POSTER_LAYOUT_METRICS.anchorTolerance) {
        issues.push({
          code: 'off_axis',
          severity: 'warning',
          elementIds: [summary.id, ...title.slice(0, 2).map((candidate) => candidate.id)].slice(0, 8),
          message: `The ${humanizeRole(summary.semanticRole ?? 'other').toLowerCase()} does not share the title region's dominant alignment anchor.`,
        });
      }
    }
  }

  for (const group of [
    text.filter((summary) => summary.semanticRole === 'day' || summary.semanticRole === 'date'),
    text.filter((summary) => summary.semanticRole === 'time'),
  ]) {
    if (group.length < 2) continue;
    const centers = group.map((summary) => boxCenterX(summary.box));
    if (Math.max(...centers) - Math.min(...centers) > POSTER_LAYOUT_METRICS.anchorTolerance) {
      issues.push({
        code: 'misaligned_group',
        severity: 'warning',
        elementIds: group.slice(0, 8).map((summary) => summary.id),
        message: 'Related logistics text does not share a consistent column or center axis.',
      });
    }
    if (group.length >= 3) {
      const ordered = [...group].sort((left, right) => left.box.y - right.box.y);
      const gaps = ordered.slice(1).map((item, index) =>
        item.box.y - (ordered[index]!.box.y + ordered[index]!.box.height));
      if (gaps.some((gap) => gap >= 0) && Math.max(...gaps) - Math.min(...gaps) > POSTER_LAYOUT_METRICS.sectionGap) {
        issues.push({
          code: 'uneven_spacing',
          severity: 'warning',
          elementIds: ordered.slice(0, 8).map((summary) => summary.id),
          message: 'A related text stack uses visibly inconsistent vertical spacing.',
        });
      }
    }
  }

  const panels = summaries.filter((summary) =>
    summary.type === 'rect' && summary.box.width >= 0.2 && summary.box.height >= 0.08 && summary.box.width * summary.box.height <= 0.55);
  for (const panel of panels) {
    const contained = text.filter((summary) => boxContains(panel.box, summary.box, 0.82));
    if (contained.length === 0) continue;
    const centered = contained.filter((summary) => summary.textAlign === 'center');
    if (centered.length < Math.ceil(contained.length / 2)) continue;
    const offAxis = centered.filter((summary) =>
      Math.abs(boxCenterX(summary.box) - boxCenterX(panel.box)) > POSTER_LAYOUT_METRICS.anchorTolerance);
    if (offAxis.length > 0) {
      issues.push({
        code: 'off_axis',
        severity: 'warning',
        elementIds: [panel.id, ...offAxis.slice(0, 7).map((summary) => summary.id)],
        message: 'Centered text inside a panel is not centered on the panel anchor.',
      });
    }
  }
  return issues;
}

function alignTextInsidePanels(
  input: Parameters<typeof applyDeterministicAlignmentSkill>[0],
  text: readonly PosterDesignerElementSummary[],
): void {
  const panels = input.summaries
    .filter((summary) =>
      summary.type === 'rect' &&
      summary.box.width >= 0.2 &&
      summary.box.height >= 0.08 &&
      summary.box.width * summary.box.height <= 0.55)
    .sort((left, right) => left.box.width * left.box.height - right.box.width * right.box.height);
  const assigned = new Set<string>();
  for (const panel of panels) {
    const contained = text.filter((summary) =>
      !assigned.has(summary.id) && boxContains(panel.box, input.boxes.get(summary.id) ?? summary.box, 0.82));
    if (contained.length === 0) continue;
    const centerAligned = contained.filter((summary) => summary.textAlign === 'center');
    if (centerAligned.length < Math.ceil(contained.length / 2)) continue;
    const anchor = boxCenterX(panel.box);
    for (const summary of contained) {
      alignSummaryCenterX(input, summary, anchor, 'center');
      assigned.add(summary.id);
    }
  }
}

function alignStackOnExistingAxis(
  input: Parameters<typeof applyDeterministicAlignmentSkill>[0],
  summaries: readonly PosterDesignerElementSummary[],
): void {
  if (summaries.length < 2) return;
  const boxes = summaries.map((summary) => input.boxes.get(summary.id)).filter(isDefined);
  if (boxes.length < 2) return;
  const centers = boxes.map(boxCenterX);
  if (Math.max(...centers) - Math.min(...centers) > 0.2) return;
  const target = median(centers);
  for (const summary of summaries) alignSummaryCenterX(input, summary, target, 'center');
}

function alignSummaryCenterX(
  input: Parameters<typeof applyDeterministicAlignmentSkill>[0],
  summary: PosterDesignerElementSummary,
  centerX: number,
  textAlign: 'center',
): void {
  const box = input.boxes.get(summary.id);
  if (!box) return;
  shiftSummary(input, summary, centerX - boxCenterX(box), 0);
  setTextAlignment(input, summary, textAlign);
}

function alignSummaryLeft(
  input: Parameters<typeof applyDeterministicAlignmentSkill>[0],
  summary: PosterDesignerElementSummary,
  left: number,
  textAlign: 'left',
): void {
  const box = input.boxes.get(summary.id);
  if (!box) return;
  shiftSummary(input, summary, left - box.x, 0);
  setTextAlignment(input, summary, textAlign);
}

function shiftGroupY(
  input: Parameters<typeof applyDeterministicAlignmentSkill>[0],
  summaries: readonly PosterDesignerElementSummary[],
  deltaY: number,
): void {
  if (Math.abs(deltaY) <= POSTER_LAYOUT_METRICS.opticalTolerance) return;
  for (const summary of summaries) shiftSummary(input, summary, 0, deltaY);
}

function shiftSummary(
  input: Parameters<typeof applyDeterministicAlignmentSkill>[0],
  summary: PosterDesignerElementSummary,
  deltaX: number,
  deltaY: number,
): void {
  if (summary.locked) return;
  const element = input.elementById.get(summary.id);
  const box = input.boxes.get(summary.id);
  if (!element || !box || element.type !== 'text') return;
  const safeX = clamp(box.x + deltaX, POSTER_LAYOUT_METRICS.safeMargin, 1 - POSTER_LAYOUT_METRICS.safeMargin - box.width);
  const safeY = clamp(box.y + deltaY, POSTER_LAYOUT_METRICS.safeMargin, 1 - POSTER_LAYOUT_METRICS.safeMargin - box.height);
  const appliedX = safeX - box.x;
  const appliedY = safeY - box.y;
  if (Math.abs(appliedX) <= POSTER_LAYOUT_METRICS.opticalTolerance && Math.abs(appliedY) <= POSTER_LAYOUT_METRICS.opticalTolerance) return;
  element.left += appliedX * input.project.canvasWidth;
  element.top += appliedY * input.project.canvasHeight;
  box.x = safeX;
  box.y = safeY;
  input.adjusted.add(summary.id);
}

function setTextAlignment(
  input: Parameters<typeof applyDeterministicAlignmentSkill>[0],
  summary: PosterDesignerElementSummary,
  alignment: PosterTextElement['textAlign'],
): void {
  if (summary.locked) return;
  const element = input.elementById.get(summary.id);
  if (!element || element.type !== 'text' || element.textAlign === alignment) return;
  element.textAlign = alignment;
  input.adjusted.add(summary.id);
}

function unionBoxes(
  boxes: readonly PosterDesignerElementSummary['box'][],
): PosterDesignerElementSummary['box'] | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function dominantTextAlignment(
  summaries: readonly PosterDesignerElementSummary[],
): PosterDesignerElementSummary['textAlign'] {
  const counts = new Map<'left' | 'center' | 'right', number>();
  for (const summary of summaries) {
    if (!summary.textAlign) continue;
    counts.set(summary.textAlign, (counts.get(summary.textAlign) ?? 0) + 1);
  }
  const ordered = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  return ordered[0]?.[0] ?? null;
}

function boxCenterX(box: PosterDesignerElementSummary['box']): number {
  return box.x + box.width / 2;
}

function boxContains(
  outer: PosterDesignerElementSummary['box'],
  inner: PosterDesignerElementSummary['box'],
  requiredRatio: number,
): boolean {
  const width = Math.max(0, Math.min(outer.x + outer.width, inner.x + inner.width) - Math.max(outer.x, inner.x));
  const height = Math.max(0, Math.min(outer.y + outer.height, inner.y + inner.height) - Math.max(outer.y, inner.y));
  return (width * height) / Math.max(0.0001, inner.width * inner.height) >= requiredRatio;
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1]! + ordered[middle]!) / 2
    : ordered[middle]!;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
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
  element: PosterElement,
  project: PosterProject,
): TemplatePosterSemanticRole | null {
  const binding = bindings.find((candidate) => candidate.sourceElementId === element.id);
  if (binding) {
    const role = inferTemplateFieldSemanticRole(binding.key, binding.label, elementText(element));
    if (role !== 'other') return role;
  }
  const bounds = fallbackBounds(element, project);
  return inferVisibleTextSemanticRole(
    elementText(element),
    element.type === 'text' ? element.fontSize / project.canvasHeight : null,
    bounds.height / project.canvasHeight,
  );
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

function safeAgentBox(box: NormalizedAgentBox): NormalizedAgentBox {
  const margin = 0.025;
  const width = clamp(box.width, 0.03, 1 - margin * 2);
  const height = clamp(box.height, 0.02, 1 - margin * 2);
  return {
    x: clamp(box.x, margin, 1 - margin - width),
    y: clamp(box.y, margin, 1 - margin - height),
    width,
    height,
  };
}

function fitTextFontSize(
  text: string,
  width: number,
  height: number,
  requestedFontSize: number,
): number {
  let fontSize = clamp(requestedFontSize, 12, Math.max(12, height * 0.92));
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const lineCount = estimatedWrappedLineCount(text, width, fontSize);
    if (lineCount * fontSize * 1.12 <= height) break;
    fontSize *= 0.9;
  }
  return Math.max(12, fontSize);
}

function estimatedWrappedLineCount(text: string, width: number, fontSize: number): number {
  const capacity = Math.max(1, Math.floor(width / Math.max(1, fontSize * 0.56)));
  return text.split(/\r?\n/).reduce((total, paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return total + 1;
    let lines = 1;
    let used = 0;
    for (const word of words) {
      const length = Math.max(1, word.length);
      if (used > 0 && used + 1 + length > capacity) {
        lines += 1;
        used = length;
      } else {
        used += (used > 0 ? 1 : 0) + length;
      }
    }
    return total + lines;
  }, 0);
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

function isHeroRole(role: TemplatePosterSemanticRole | null): boolean {
  return role === 'title' || role === 'theme';
}

function isSupportRole(role: TemplatePosterSemanticRole | null, agentCreated: boolean): boolean {
  if (agentCreated) return true;
  return role !== null && [
    'tagline',
    'person_name',
    'date',
    'day',
    'time',
    'venue',
    'contact',
    'phone',
    'website',
    'email',
    'extra_details',
  ].includes(role);
}

function chooseMovableSupportText(
  left: PosterDesignerElementSummary,
  right: PosterDesignerElementSummary,
): PosterDesignerElementSummary {
  const score = (element: PosterDesignerElementSummary) =>
    (element.agentCreated ? 100 : 0) +
    (isSupportRole(element.semanticRole, element.agentCreated) ? 20 : 0) +
    element.zIndex / 10_000;
  return score(right) >= score(left) ? right : left;
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

function semanticFactFingerprint(
  role: TemplatePosterSemanticRole | null,
  value: string,
): string | null {
  if (role === 'time') {
    const times = [...value.toLowerCase().matchAll(/\b(\d{1,2})(?:(?::|\.)(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/g)]
      .map((match) => `${Number(match[1])}:${match[2] ?? '00'}${match[3]!.startsWith('a') ? 'am' : 'pm'}`)
      .sort();
    return times && times.length > 0 ? `time:${[...new Set(times)].join('|')}` : null;
  }
  if (role === 'date') {
    const normalized = value.toLowerCase().replace(/(\d)(?:st|nd|rd|th)\b/g, '$1').replace(/[^a-z0-9]+/g, ' ').trim();
    return normalized ? `date:${normalized}` : null;
  }
  return null;
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
