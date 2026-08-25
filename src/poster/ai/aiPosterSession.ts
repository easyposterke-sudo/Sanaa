export interface AIPosterSessionImage {
  name: string;
  role: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface AIPosterSession {
  brief: string;
  images: AIPosterSessionImage[];
  themeColor: string | null;
  excludedTemplateIds: string[];
  currentTemplateId: string;
  /** Keeps "another design" inside the poster type the user explicitly chose. */
  categoryId: string | null;
  typographyMood: import('../../../shared/ai/posterAssistant').PosterTypographyMood | null;
}
