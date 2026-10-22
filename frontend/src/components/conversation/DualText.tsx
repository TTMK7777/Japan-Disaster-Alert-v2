/**
 * 2 言語の文言を上下に並べる（例: 利用者の言語 ＋ 日本語）。
 * 2 つが同じ本文なら 1 つだけ出す（利用者が日本語のときなど）。
 * 各行に lang 属性を付ける（漢字の字形・読み上げソフトの言語判定のため）。
 */
export interface DualTextProps {
  primary: string;
  primaryLang: string;
  secondary?: string;
  secondaryLang?: string;
}

export default function DualText({
  primary,
  primaryLang,
  secondary,
  secondaryLang,
  primaryClassName = 'block',
  secondaryClassName = 'block text-sm text-gray-700',
}: DualTextProps & { primaryClassName?: string; secondaryClassName?: string }) {
  const showSecondary = !!secondary && secondary !== primary;
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
    </span>
  );
}
