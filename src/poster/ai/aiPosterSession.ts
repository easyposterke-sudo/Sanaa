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
  typographyMood: import('../../../shared/ai/posterAssistant').PosterTypographyMood | null;
}
