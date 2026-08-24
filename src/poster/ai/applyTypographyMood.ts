import { isShapeLayer } from '../../core/types';
import type { Poster3DTextElement, PosterProject, PosterTextElement } from '../types';
import type { PosterTypographyMood } from '../../../shared/ai/posterAssistant';

const MOODS: Record<
  PosterTypographyMood,
  { family: string; titleFamily: string; weight: string; titleWeight: string; spacing: number }
> = {
  playful: {
    family: '"Fredoka", sans-serif',
    titleFamily: '"Chewy", sans-serif',
    weight: '500',
    titleWeight: '700',
    spacing: 10,
  },
  official: {
    family: '"Montserrat", sans-serif',
    titleFamily: 'Georgia, serif',
    weight: '500',
    titleWeight: '700',
    spacing: 20,
  },
  crisp: {
    family: '"Inter", sans-serif',
    titleFamily: '"Inter", sans-serif',
    weight: '500',
    titleWeight: '800',
    spacing: 5,
  },
  elegant: {
    family: '"Playfair Display", serif',
    titleFamily: '"Playfair Display", serif',
    weight: '400',
    titleWeight: '700',
    spacing: 8,
  },
  bold: {
    family: '"Oswald", sans-serif',
    titleFamily: '"Anton", sans-serif',
    weight: '600',
    titleWeight: '900',
    spacing: 15,
  },
  modern: {
    family: '"Poppins", sans-serif',
    titleFamily: '"Poppins", sans-serif',
    weight: '500',
    titleWeight: '800',
    spacing: 10,
  },
};

/** Applies a coherent font mood while preserving every layer's size, position, color, and wording. */
export function applyTypographyMood(
  project: PosterProject,
  mood: PosterTypographyMood,
): PosterProject {
  const preset = MOODS[mood];
  const text = project.elements.filter(
    (element): element is PosterTextElement => element.type === 'text',
  );
  const largestSize = Math.max(0, ...text.map((element) => element.fontSize * element.scaleY));
  return {
    ...project,
    elements: project.elements.map((element) => {
      if (element.type === '3d-text') {
        return applyThreeDTypography(element, preset.titleFamily, preset.titleWeight, preset.spacing);
      }
      if (element.type !== 'text') return element;
      const isTitle = largestSize > 0 && element.fontSize * element.scaleY >= largestSize * 0.72;
      return {
        ...element,
        fontFamily: isTitle ? preset.titleFamily : preset.family,
        fontWeight: isTitle ? preset.titleWeight : preset.weight,
        charSpacing: isTitle ? preset.spacing : Math.min(preset.spacing, 8),
      };
    }),
  };
}

function applyThreeDTypography(
  element: Poster3DTextElement,
  fontFamily: string,
  fontWeight: string,
  letterSpacing: number,
): Poster3DTextElement {
  if (!element.config.text) return element;
  const text = { ...element.config.text, fontFamily, fontWeight, letterSpacing };
  return {
    ...element,
    config: {
      ...element.config,
      text,
      ...(element.config.textLayers
        ? {
            textLayers: element.config.textLayers.map((layer) =>
              isShapeLayer(layer)
                ? layer
                : {
                    ...layer,
                    text: { ...layer.text, fontFamily, fontWeight, letterSpacing },
                  },
            ),
          }
        : {}),
    },
  };
}
