'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { PREFECTURES, prefectureDisplayName } from '@/lib/prefectures';
import { PREF_PARAM, readPrefParam } from '@/lib/urlPreferences';
import QrCodeSvg from './QrCodeSvg';
import { buildPosterTargetUrl, isLocalOnlyOrigin, resolvePosterOrigin } from './posterUrl';
import { POSTER_CONTROLS_TEXT as C, POSTER_TEXT as T, type BilingualText } from './posterText';

/** 英語（上）＋やさしい日本語（下）の 2 段 */
function Bilingual({ text, className }: { text: BilingualText; className?: string }) {
  return (
    <span className={className}>
      <span lang="en" className="poster-en">{text.en}</span>
      <span lang="ja" className="poster-ja">{text.easyJa}</span>
    </span>
  );
}

const inline = (t: BilingualText) => `${t.en} / ${t.easyJa}`;

/** ページの URL の `?pref=` を書き換える（履歴は増やさない・他のクエリは残す） */
function syncPrefToLocation(code: string | null): void {
  const params = new URLSearchParams(window.location.search);
  if (code) params.set(PREF_PARAM, code);
  else params.delete(PREF_PARAM);
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

export default function PosterClient() {
  // origin と ?pref= はブラウザでしか分からないので、マウント後に読む（SSR では QR を出さない）
  const [origin, setOrigin] = useState<string | null>(null);
  const [pref, setPref] = useState<string | null>(null);

  useEffect(() => {
    // 公開 URL（ビルド時の NEXT_PUBLIC_SITE_URL）があればそれを優先。無ければ今開いている origin
    setOrigin(resolvePosterOrigin(process.env.NEXT_PUBLIC_SITE_URL, window.location.origin));
    setPref(readPrefParam(window.location.search));
  }, []);

  const targetUrl = origin === null ? null : buildPosterTargetUrl(origin, pref);
  const localOnly = origin !== null && isLocalOnlyOrigin(origin);
  const areaEn = prefectureDisplayName(pref, 'en');
  const areaJa = prefectureDisplayName(pref, 'easy_ja');
  const areaText: BilingualText =
    areaEn && areaJa
      ? { en: T.area.en.replace('{pref}', areaEn), easyJa: T.area.easyJa.replace('{pref}', areaJa) }
      : T.areaChoose;

  const onAreaChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const code = readPrefParam(`?${PREF_PARAM}=${encodeURIComponent(e.target.value)}`);
    setPref(code);
    syncPrefToLocation(code);
  };

  return (
    <main id="main-content" className="poster-page">
      <section className="poster-controls" aria-label={inline(C.heading)}>
        <h1 className="poster-controls-heading">{inline(C.heading)}</h1>
        <p className="poster-controls-note">{inline(C.note)}</p>
        <div className="poster-controls-row">
          <label className="poster-controls-field">
            <span>{inline(C.area)}</span>
            <select value={pref ?? ''} onChange={onAreaChange}>
              <option value="">{inline(C.noArea)}</option>
              {PREFECTURES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.en} / {p.ja}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="poster-print-button" onClick={() => window.print()} disabled={targetUrl === null}>
            {inline(C.print)}
          </button>
        </div>
        <p className="poster-controls-url">
          <span>{inline(C.url)}: </span>
          <code data-testid="poster-qr-url">{targetUrl ?? ''}</code>
        </p>
        {/* 画面だけの警告（.poster-controls ごと印刷されない） */}
        {localOnly && (
          <div role="alert" data-testid="poster-local-warning" className="poster-local-warning">
            <p className="poster-local-warning-title">{inline(C.localOnly)}</p>
            <p>{inline(C.localOnlyHint)}</p>
          </div>
        )}
      </section>

      <article className="poster-sheet">
        <p className="poster-badge">
          <Bilingual text={T.badge} />
        </p>
        <h2 className="poster-headline">
          <Bilingual text={T.headline} />
        </h2>
        <p className="poster-area" data-testid="poster-area">
          <Bilingual text={areaText} />
        </p>

        <div className="poster-qr-frame">
          {targetUrl === null ? (
            <p className="poster-qr-placeholder">{inline(C.preparing)}</p>
          ) : (
            <QrCodeSvg text={targetUrl} label={inline(T.qrLabel)} className="poster-qr" />
          )}
        </div>
        {/* QR が読めない端末でも打てるよう、同じ URL を文字でも印字する */}
        {targetUrl !== null && (
          <p className="poster-url">
            <span lang="en" className="poster-url-label">{T.urlLabel.en} / </span>
            <span lang="ja" className="poster-url-label">{T.urlLabel.easyJa}</span>
            <span data-testid="poster-sheet-url" className="poster-url-text">{targetUrl}</span>
          </p>
        )}

        <p className="poster-scan">
          <Bilingual text={T.scan} />
        </p>
        <p className="poster-language">
          <svg className="poster-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" />
            <path d="M2.5 12h19M12 2.5c3 3 3 16 0 19M12 2.5c-3 3-3 16 0 19" />
          </svg>
          <Bilingual text={T.language} />
        </p>

        <section className="poster-checklist">
          <h3 className="poster-checklist-title">
            <span lang="en">{T.checklistTitle.en}</span>
            <span aria-hidden="true"> / </span>
            <span lang="ja">{T.checklistTitle.easyJa}</span>
          </h3>
          <ol>
            {T.checklist.map((item, i) => (
              <li key={item.en}>
                <span className="poster-step" aria-hidden="true">
                  {i + 1}
                </span>
                <Bilingual text={item} />
              </li>
            ))}
          </ol>
        </section>

        <footer className="poster-footer">
          <svg className="poster-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" />
            <path d="M12 10.5v7M12 6.5v1.5" />
          </svg>
          <div>
            <Bilingual text={T.jmaRelay} />
            <Bilingual text={T.notCovered} />
          </div>
        </footer>
      </article>
    </main>
  );
}
