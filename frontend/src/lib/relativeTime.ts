/**
 * 「いつの情報か」を利用者の言語で表す。
 *
 * 気象庁は継続中の警報について、変化がない限り reportDatetime を更新しない。
 * そのため 3 か月前に出た注意報が当時の日付を持ったまま届く。
 * 絶対時刻（2026/5/28 10:16）だけを出すと、それが古い情報なのか
 * 直前の発表なのかを利用者が判断できない。
 *
 * `Intl.RelativeTimeFormat` を使うので、**16 言語ぶんの文言を用意しなくてよい**。
 * ブラウザが言語ごとの語形（3 months ago / 3か月前 / il y a 3 mois）を持っている。
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * ISO 8601 の日時から相対表現を作る。解釈できなければ null。
 *
 * 気象庁の `reportDatetime` は `2026-05-28T10:16:00+09:00` のように
 * **オフセット付き**で届くため、端末のタイムゾーンが日本に合っていなくても
 * 正しく解釈できる。
 * （地震の `time` は `2026/08/23 22:45:00` とオフセットが無く、
 *   端末ローカル時刻として解釈されてしまうので同じ扱いはできない。
 *   訪日客の端末は出国前のタイムゾーンのままであることが多い）
 */
export function formatRelativeTime(
  isoDateTime: string,
  locale: string,
  now: Date = new Date()
): string | null {
  if (!isoDateTime) return null;

  // オフセットもしくは Z が無い文字列は端末ローカル解釈になるため受け付けない。
  // 誤った「◯時間前」を出すくらいなら何も出さない方がよい
  if (!/[+-]\d{2}:?\d{2}$|Z$/.test(isoDateTime)) return null;

  const then = new Date(isoDateTime);
  if (Number.isNaN(then.getTime())) return null;

  const diffMs = then.getTime() - now.getTime();
  const abs = Math.abs(diffMs);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (abs < HOUR) return rtf.format(Math.round(diffMs / MINUTE), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diffMs / HOUR), 'hour');
  if (abs < 30 * DAY) return rtf.format(Math.round(diffMs / DAY), 'day');
  if (abs < 365 * DAY) return rtf.format(Math.round(diffMs / (30 * DAY)), 'month');
  return rtf.format(Math.round(diffMs / (365 * DAY)), 'year');
}

/**
 * その情報が「古い」と言えるか。
 *
 * 継続中の警報は数か月前の日時を持つのが正常なので、それ自体は異常ではない。
 * ただし利用者に対しては、**新しい発表と同じ見え方をさせない**必要がある。
 */
export function isStale(isoDateTime: string, now: Date = new Date(), thresholdMs = DAY): boolean {
  if (!/[+-]\d{2}:?\d{2}$|Z$/.test(isoDateTime)) return false;
  const then = new Date(isoDateTime);
  if (Number.isNaN(then.getTime())) return false;
  return now.getTime() - then.getTime() > thresholdMs;
}
