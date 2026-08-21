import facebookSvg from './facebook.svg?raw';
import instagramSvg from './instagram.svg?raw';
import linkedinSvg from './linkedin.svg?raw';
import tiktokSvg from './tiktok.svg?raw';
import whatsappSvg from './whatsapp.svg?raw';
import xSvg from './x.svg?raw';
import youtubeSvg from './youtube.svg?raw';

const SOCIAL_ICON_SVGS = {
  facebook: facebookSvg,
  instagram: instagramSvg,
  youtube: youtubeSvg,
  x: xSvg,
  tiktok: tiktokSvg,
  linkedin: linkedinSvg,
  whatsapp: whatsappSvg,
} as const;

export type SocialIconName = keyof typeof SOCIAL_ICON_SVGS;

export function isSocialIconName(value: string): value is SocialIconName {
  return Object.prototype.hasOwnProperty.call(SOCIAL_ICON_SVGS, value);
}

export function socialIconSvg(name: SocialIconName, color: string): string {
  return SOCIAL_ICON_SVGS[name].replaceAll('currentColor', color);
}
