export type SupportedLanguage =
  | 'ja'
  | 'en'
  | 'zh'
  | 'zh-TW'
  | 'ko'
  | 'vi'
  | 'th'
  | 'id'
  | 'ms'
  | 'tl'
  | 'ne'
  | 'fr'
  | 'de'
  | 'it'
  | 'es'
  | 'easy_ja';

export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
}
