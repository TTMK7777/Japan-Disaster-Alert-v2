'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { getTranslation, getLocale } from '@/i18n/translations';
import { formatRelativeTime } from '@/lib/relativeTime';
import {
  normalizeSeverity,
  SEVERITY_STYLES,
  cardClassName,
  metaClassName,
  badgeClassName,
} from '@/lib/warningSeverity';

/**
 * 発表中の噴火警報。
 *
 * ## なぜ独立した画面にしないか
 *
 * 前身の `VolcanoAlert` は 120 火山のカタログを一覧する画面だったが、
 * 利用者が知りたいのは「いま警報が出ている火山はどれか」であって
 * 火山の一覧ではない。加えて警報の取得先 URL が存在せず（404 を握りつぶす作り）、
 * **一度も警報を表示できたことがなかった**。
 *
 * ここでは発表中の警報だけを危険な順に並べ、警報タブの中に置く。
 * タブを 5 つに増やすとモバイル幅でナビが破綻するのと、
 * 噴火警報は意味的に「警報」なので同じ場所にある方が探しやすい。
 *
 * ## 表示範囲を都道府県で絞らない理由
 *
 * 対象市町村は取れるので絞ることもできるが、噴火警戒レベルは
 * **旅程を決めるための情報**で、いま立っている場所の情報ではない。
 * 東京にいる利用者が阿蘇山のレベル3を知れないと役に立たない。
 * 件数は 15 件前後で収まるため、全件を重大度順に出す。
 */

interface VolcanoWarning {
  volcano_code: string;
  volcano_name: string;
  volcano_name_en?: string | null;
  alert_level?: number | null;
  /** 「噴火警戒レベル3」のような見出し。API が言語に合わせて返す */
  level_label?: string;
  /** レベルのキーワード、またはレベル制でない火山の警報種別 */
  alert_level_name: string;
  /** とるべき防災対応。レベル制でない火山では空 */
  action?: string;
  severity: string;
  condition?: string;
  is_continuing?: boolean;
  issued_at: string;
  municipalities?: string[];
}

interface VolcanoWarningsProps {
  language: string;
}

/** 気象庁の噴火警戒レベルの解説ページ。出典を常に辿れるようにしておく */
const JMA_VOLCANO_URL = 'https://www.jma.go.jp/jma/kishou/know/kazan/kaisetsu.html';

export default function VolcanoWarnings({ language }: VolcanoWarningsProps) {
  const [warnings, setWarnings] = useState<VolcanoWarning[]>([]);
  const [failed, setFailed] = useState(false);

  // 前回の取得を必ず中断してから始める（言語切替でレスポンス順序が
  // 逆転すると、旧言語の警報が新言語の UI に載る）
  const fetchRef = useRef<AbortController | null>(null);
  const fetchWarnings = useCallback(async () => {
    fetchRef.current?.abort();
    const controller = new AbortController();
    fetchRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/volcanoes/warnings?lang=${encodeURIComponent(language)}`,
        { signal: controller.signal }
      );
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      if (controller.signal.aborted) return;
      setWarnings(Array.isArray(data) ? data : []);
      setFailed(false);
    } catch (error) {
      if (controller.signal.aborted && (error as Error).name === 'AbortError') return;
      console.error('Volcano warning fetch error:', error);
      setFailed(true);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [language]);

  useEffect(() => {
    fetchWarnings();
    // 噴火警戒レベルは分単位で動くものではないので 15 分間隔
    const interval = setInterval(fetchWarnings, 15 * 60 * 1000);
    return () => {
      clearInterval(interval);
      fetchRef.current?.abort();
    };
  }, [fetchWarnings]);

  // 取得に失敗したとき、警報が無いかのように見せない。
  // 何も描画しないことで「安全だ」と読まれるのが一番まずい
  if (failed) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-300" role="status">
        {getTranslation(language, 'volcano.title')} — {getTranslation(language, 'warning.error')}
      </p>
    );
  }

  // 発表中の警報が無いときは何も置かない。日本では常時いくつか出ているため
  // 「ありません」の行を常設するより静かな方が読みやすい
  if (warnings.length === 0) return null;

  return (
    <section aria-labelledby="volcano-warnings-heading" className="space-y-3">
      <h3
        id="volcano-warnings-heading"
        className="font-bold text-lg text-gray-800 dark:text-gray-100"
      >
        🌋 {getTranslation(language, 'volcano.title')}
      </h3>

      <ul className="space-y-2">
        {warnings.map((warning) => {
          const severity = normalizeSeverity(warning.severity);
          const style = SEVERITY_STYLES[severity];
          const relative = formatRelativeTime(warning.issued_at, getLocale(language));
          const areas = warning.municipalities ?? [];

          return (
            <li key={`${warning.volcano_code}-${warning.alert_level ?? warning.alert_level_name}`}>
              <div
                className={`p-3 rounded-lg ${cardClassName(severity)}`}
                /* 気象庁の階級で警報以上のものだけが読み上げに割り込む */
                {...(style.interrupts ? { role: 'alert' } : {})}
              >
                <div className="flex items-start gap-2 flex-wrap">
                  {warning.level_label && (
                    <span
                      className={`px-2 py-0.5 text-xs font-bold rounded whitespace-nowrap ${badgeClassName(severity)}`}
                    >
                      {warning.level_label}
                    </span>
                  )}
                  <h4 className="font-bold">{warning.volcano_name}</h4>
                </div>

                {/* 内容の行は 1 本にする。
                    レベル制の火山では防災対応がキーワードを言い直しているので
                    防災対応だけを出し、レベル制でない火山ではキーワードが内容そのもの。
                    以前は「火山名 — キーワード」を横に並べていたが、
                    名前が長いと折り返して行頭にダッシュだけが残った */}
                <p className="mt-1 text-sm">
                  {warning.action || warning.alert_level_name}
                </p>

                {areas.length > 0 && (
                  <p className={`mt-1 text-xs ${metaClassName(severity)}`}>
                    {getTranslation(language, 'volcano.affectedAreas')}: {areas.join(' / ')}
                  </p>
                )}

                {/* 継続中の警報は「発表時刻」ではなく最終更新。
                    気象庁は変化がない限り発表日時を更新しないため、
                    十数年前の日時が「発表時刻」として出ることがある */}
                <p className={`mt-1 text-xs ${metaClassName(severity)}`}>
                  {warning.is_continuing
                    ? getTranslation(language, 'lastUpdate')
                    : getTranslation(language, 'warning.issuedAt')}
                  : {new Date(warning.issued_at).toLocaleString(getLocale(language))}
                  {relative && <span className="ml-1">({relative})</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-gray-600 dark:text-gray-400">
        <a
          href={JMA_VOLCANO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          {getTranslation(language, 'volcano.source')}
        </a>
      </p>
    </section>
  );
}
