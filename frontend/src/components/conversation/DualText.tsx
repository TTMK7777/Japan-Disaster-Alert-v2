/**
 * 2 言語の文言を上下に並べる（例: 利用者の言語 ＋ 日本語）。3 行目（英語など）も添えられる。
 * 同じ本文の行は 1 つだけ出す（利用者が日本語のとき・英語のときなど）。
 * 各行に lang 属性を付ける（漢字の字形・読み上げソフトの言語判定のため）。
 */
export interface DualTextProps {
  primary: string;
  primaryLang: string;
  secondary?: string;
  secondaryLang?: string;
  /** 3 行目（会話カードの文に添える英語。訳の確認が済むまで誤訳を英語で補う） */
  tertiary?: string;
  tertiaryLang?: string;
}

export default function DualText({
  primary,
  primaryLang,
  secondary,
  secondaryLang,
  primaryClassName = 'block',
  tertiary,
  tertiaryLang,
  secondaryClassName = 'block text-sm text-gray-700',
  tertiaryClassName = 'block text-sm text-gray-700',
}: DualTextProps & { primaryClassName?: string; secondaryClassName?: string; tertiaryClassName?: string }) {
  const showSecondary = !!secondary && secondary !== primary;
  const showTertiary = !!tertiary && tertiary !== primary && tertiary !== secondary;
  return (
    <span className="min-w-0 break-words">
      <span lang={primaryLang} className={primaryClassName}>
        {primary}
      </span>
      {showSecondary && (
        <span lang={secondaryLang} className={secondaryClassName}>
          {secondary}
        </span>
      )}
      {showTertiary && (
        <span lang={tertiaryLang} className={tertiaryClassName}>
          {tertiary}
        </span>
      )}
    </span>
  );
}
