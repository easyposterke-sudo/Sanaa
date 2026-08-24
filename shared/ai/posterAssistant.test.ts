import { describe, expect, it } from 'vitest';
import { createFallbackPosterAssistantAction } from './posterAssistant';

describe('poster assistant fallback', () => {
  it('combines controlled theme, typography, and redesign actions', () => {
    expect(
      createFallbackPosterAssistantAction({
        instruction: 'Use playful fonts, make it blue, and find another design',
        brief: 'Create a Sunday worship poster for Grace Chapel.',
        currentThemeColor: null,
      }),
    ).toMatchObject({
      themeColor: '#2563eb',
      typographyMood: 'playful',
      chooseAnotherDesign: true,
    });
  });

  it('chooses a suitable color when the user requests a theme without naming one', () => {
    expect(
      createFallbackPosterAssistantAction({
        instruction: 'Please change the theme color',
        brief: 'Create an official business conference announcement.',
        currentThemeColor: '#ffffff',
      }).themeColor,
    ).toBe('#1d4ed8');
  });
});
