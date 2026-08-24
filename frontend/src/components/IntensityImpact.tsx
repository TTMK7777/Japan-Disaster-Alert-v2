'use client';

import { memo } from 'react';
import { impactsFor } from '@/lib/intensityImpact';
import { IMPACT_TEXT } from '@/i18n/impactText';

interface IntensityImpactProps {
  intensity: string;
  language: string;
}

/**
 * 「この揺れで交通やライフラインに何が起きるか」を出す。
 *
 * このアプリが Safety tips のような既存サービスと違うのは、
 * 何が起きたか（震度・マグニチュード）ではなく **何が起きるか** を出すところ。
 * 訪日客の災害時ニーズ調査で上位に来るのは
 * 日程の崩壊 37.3% / 今後の日程 27.0% / 交通と空港の情報 22.2% で、
 * 「電車は動くのか」が最も切実な問いになる。
 *
 * 根拠は気象庁「震度階級関連解説表」の
 * 「ライフライン・インフラ等への影響」。**震度で閾値が付いている唯一の節**で、
 * 偶然にもそれが訪日客の最大の関心とちょうど重なっている。
 *
 * 閾値の判定は lib/intensityImpact、文言は i18n/impactText にある。
 * ここは表示だけを持つ。
 */
function IntensityImpact({ intensity, language }: IntensityImpactProps) {
  const keys = impactsFor(intensity);

  // 震度1〜3、および震度不明では何も出さない。
  // 閾値に届かないものを出せば誇張、震度不明で出せば根拠のない推定になる
  if (keys.length === 0) return null;

  const text = (key: string) => IMPACT_TEXT[key]?.[language] || IMPACT_TEXT[key]?.en || '';

  return (
    <section
      className="mt-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 overflow-hidden"
      aria-label={text('heading')}
    >
      <h4 className="px-3 py-2 text-sm font-bold text-slate-900 dark:text-slate-100 bg-slate-200/70 dark:bg-slate-700/60">
        {text('heading')}
      </h4>

      <ul className="px-3 py-2 space-y-1.5">
        {keys.map((key) => (
          <li key={key} className="flex gap-2 text-sm text-slate-800 dark:text-slate-200">
            {/* 記号は箇条書きの目印のみ。絵文字で意味を持たせると
                言語や端末によって見え方が変わるうえ、項目ごとに違う絵文字を
                選ぶと恣意的な重みづけに見える */}
            <span aria-hidden="true" className="select-none text-slate-400">•</span>
            <span>{text(key)}</span>
          </li>
        ))}
      </ul>

      {/* 気象庁の留意事項(2)(4)。**この免責を外さないこと。**
          同じ震度でも建物や階で揺れは異なり、記載の全現象が起きるとは限らず、
          より大きい被害もより小さい被害もありうる、と気象庁自身が明記している */}
      <p className="px-3 pb-2 text-xs text-slate-600 dark:text-slate-400">
        {text('disclaimer')}
      </p>

      {/* 出典。これが無いと「アプリが勝手に言っている」ことになる。
          表題は気象庁の正式名称のまま（訳すと原典に辿り着けない） */}
      <p className="px-3 pb-2 text-xs text-slate-500 dark:text-slate-500">
        <a
          href="https://www.jma.go.jp/jma/kishou/know/shindo/kaisetsu.html"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          気象庁「震度階級関連解説表」
        </a>
      </p>
    </section>
  );
}

export default memo(IntensityImpact);
