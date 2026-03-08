export const WECHAT_THEMES = [
  'industrial',
  'magazine-editorial',
  'magazine-bold',
  'newspaper-classic',
  'minimal-clean',
  'modernist-print',
  'tech-spec',
] as const;

export type WechatTheme = (typeof WECHAT_THEMES)[number];

export const DEFAULT_WECHAT_THEME: WechatTheme = 'magazine-editorial';

export function isWechatTheme(value: unknown): value is WechatTheme {
  return typeof value === 'string' && (WECHAT_THEMES as readonly string[]).includes(value);
}
