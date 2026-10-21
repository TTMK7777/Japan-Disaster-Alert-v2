/**
 * localStorage の読み書き。**例外を外に出さない。**
 *
 * Chrome の「Cookie をすべてブロック」や企業端末のポリシー、一部のプライベートブラウズでは
 * `window.localStorage` を**参照しただけで** SecurityError が投げられる（setItem だけでなく getItem も）。
 * 以前は useTheme / useDisplayPreferences / InstallBanner が素の localStorage を呼んでいたため、
 * この環境ではマウント時の例外で**画面全体が真っ白**になっていた。
 * 設定が保存できない程度で災害情報を出せなくなるのは許されないので、
 * 読めなければ null（＝未保存と同じ扱い）、書けなければ諦める。
 */

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    console.warn(`[storage] ${key} を読めませんでした:`, err);
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`[storage] ${key} を保存できませんでした:`, err);
  }
}
