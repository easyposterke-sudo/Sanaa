import type { PosterTemplateDefinition } from '../../templateTypes';
import { businessAnnouncementTemplate } from './businessCard';
import { churchEventTemplate } from './churchEvent';
import { conferenceSimpleTemplate } from './conferenceSimple';
import { genericEventTemplate } from './genericEvent';

export const BUNDLED_POSTER_TEMPLATES: PosterTemplateDefinition[] = [
  conferenceSimpleTemplate,
  churchEventTemplate,
  businessAnnouncementTemplate,
  genericEventTemplate,
];

export function getBundledPosterTemplates(): PosterTemplateDefinition[] {
  return BUNDLED_POSTER_TEMPLATES;
}

export {
  conferenceSimpleTemplate,
  churchEventTemplate,
  businessAnnouncementTemplate,
  genericEventTemplate,
};
