'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { getTranslation } from '@/i18n/translations';
import { readPrefParam } from '@/lib/urlPreferences';
import QrCodeSvg from '../poster/QrCodeSvg';
import { buildPosterTargetUrl } from '../poster/posterUrl';
import {
  FETCH_TIMEOUT_MS,
  INITIAL_MEMORY,
  POLL_INTERVAL_MS,
  ROTATE_INTERVAL_MS,
  SNAPSHOT_PATH,
  applyFetchResult,
  MAX_DENSITY,
  buildAlertBands,
  densityFlags,
  burnInOffset,
  datasetView,
  fetchSnapshot,
  formatIntensity,
  formatJst,
  lastReceivedAt,
  limitBands,
  otherVolcanoes,
  parseLangsParam,
  regionName,
  resolveSignageOrigin,
  tsunamiEpicenter,
  volcanoName,
  type AlertBand,
  type DatasetView,
  type QuakeItem,
  type DensityFlags,
  type SnapshotMemory,
  type TsunamiItem,
  type TsunamiLevel,
  type VolcanoItem,
} from './signageModel';
import { SIGNAGE_TEXT, fillTemplate, type SignageLanguage, type SignageStrings } from './signageText';

/** 帯の 2 段目に出す言語（表示中が日本語なら英語、それ以外は日本語） */
const secondLanguage = (lang: SignageLanguage): SignageLanguage => (lang === 'ja' ? 'en' : 'ja');

const TSUNAMI_LABEL: Record<TsunamiLevel, keyof SignageStrings> = {
  major_warning: 'tsunamiMajorWarning',
  warning: 'tsunamiWarning',
  advisory: 'tsunamiAdvisory',
  unknown: 'tsunamiUnknown',
};

function parseTime(value: string | null): number | null {
  if (value === null) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

interface Setup {
  /** 言語の並び（URL から 1 回だけ読む） */
  langs: SignageLanguage[];
  pref: string | null;
  origin: string;
}

export default function SignageClient() {
  // URL・origin はブラウザでしか分からないので、マウント後に 1 回だけ読む
  const [setup, setSetup] = useState<Setup | null>(null);
  const [memory, setMemory] = useState<SnapshotMemory>(INITIAL_MEMORY);
  const [now, setNow] = useState<number>(0);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const search = window.location.search;
    setSetup({
      langs: parseLangsParam(search),
      pref: readPrefParam(search),
      origin: resolveSignageOrigin(process.env.NEXT_PUBLIC_SITE_URL, window.location.origin),
    });
    setNow(Date.now());
  }, []);

  // snapshot の取得: 終わってから POLL_INTERVAL_MS 後に次を取る（重ならない）
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    const run = async () => {
      controller = new AbortController();
      const abortTimer = setTimeout(() => controller?.abort(), FETCH_TIMEOUT_MS);
      const result = await fetchSnapshot(`${API_BASE_URL}${SNAPSHOT_PATH}`, controller.signal);
      clearTimeout(abortTimer);
      if (cancelled) return;
      const at = Date.now();
      setMemory((m) => applyFetchResult(m, result, at));
      setNow(at);
      timer = setTimeout(run, POLL_INTERVAL_MS);
    };
    void run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, []);

  // 言語のローテーションと、古さ判定に使う現在時刻の更新（取得が止まっていても 15 分で「取得できません」に落とす）
  useEffect(() => {
    const id = setInterval(() => {
      setRotation((r) => r + 1);
      setNow(Date.now());
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  if (setup === null) {
    return <main id="main-content" className="signage-root" data-testid="signage-root" />;
  }
  return <SignageScreen setup={setup} memory={memory} now={now} rotation={rotation} />;
}

interface ScreenProps {
  setup: Setup;
  memory: SnapshotMemory;
  now: number;
  rotation: number;
}

function SignageScreen({ setup, memory, now, rotation }: ScreenProps) {
  const lang = setup.langs[rotation % setup.langs.length];
  const t = SIGNAGE_TEXT[lang];
  const quakes = datasetView(memory, 'earthquakes', now);
  const tsunamiView = datasetView(memory, 'tsunami', now);
  const volcanoView = datasetView(memory, 'volcano_warnings', now);
  const itemsOf = <T,>(v: DatasetView<T>): T[] => (v.kind === 'ok' || v.kind === 'stale' ? v.items : []);
  const allBands = buildAlertBands(itemsOf(tsunamiView), itemsOf(volcanoView));

  // 画面に収まらなければ 1 段ずつ詰める（文字は小さくしない）。表示する中身が変わったら 0 から測り直す。
  // 依存は中身を表す文字列だけにする（導出オブジェクトを依存に入れない）
  const [density, setDensity] = useState(0);
  const mainRef = useRef<HTMLDivElement>(null);
  const bandsRef = useRef<HTMLElement>(null);
  const contentKey = [
    lang,
    quakes.kind,
    tsunamiView.kind,
    volcanoView.kind,
    allBands.map((b) => b.key).join(','),
    memory.snapshot?.generatedAt ?? 0,
  ].join('|');
  useLayoutEffect(() => {
    setDensity(0);
  }, [contentKey]);
  useLayoutEffect(() => {
    const overflows = (el: HTMLElement | null) =>
      el !== null && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    if (density < MAX_DENSITY && (overflows(bandsRef.current) || overflows(mainRef.current))) {
      setDensity((d) => Math.min(MAX_DENSITY, d + 1));
    }
  });

  const { shown, hiddenCount } = limitBands(allBands, densityFlags(density, allBands.length).maxBands);
  const flags = densityFlags(density, shown.length);
  const staleTimes = [quakes, tsunamiView, volcanoView].flatMap((v) => (v.kind === 'stale' ? [v.fetchedAt] : []));
  const staleSince = staleTimes.length > 0 ? Math.min(...staleTimes) : null;
  const region = regionName(setup.pref, lang);
  const lastReceived = lastReceivedAt(memory);
  const shift = burnInOffset(rotation);

  return (
    <main
      id="main-content"
      className="signage-root"
      data-testid="signage-root"
      data-density={density}
      lang={lang}
      style={{ transform: `translate(${shift}px, ${shift}px)` }}
    >
      <div className="signage-main" ref={mainRef}>
        {!flags.hideHeading && (
          <h1 className="signage-heading">{lang === 'ja' ? `${region}${t.heading}` : `${region} · ${t.heading}`}</h1>
        )}

        {staleSince !== null && (
          <p className="signage-stale-note" data-testid="signage-stale-note" role="status">
            {fillTemplate(t.staleNote, { time: formatJst(staleSince, now) })}
          </p>
        )}

        <section className="signage-bands" aria-live="polite" ref={bandsRef}>
          {shown.map((band, i) => (
            <AlertBandView key={band.key} band={band} lang={lang} now={now} flags={flags} first={i === 0} />
          ))}
          {hiddenCount > 0 && (
            <p className="signage-more" data-testid="signage-more">
              {fillTemplate(t.moreAlerts, { n: hiddenCount })}
            </p>
          )}
          <TsunamiStatus view={tsunamiView} t={t} now={now} />
          {!flags.hideQuake && <QuakePanel view={quakes} lang={lang} now={now} />}
        </section>

        <section className="signage-lines">
          <VolcanoLine view={volcanoView} lang={lang} now={now} />
          <p className="signage-line signage-weather">{t.weatherNotShown}</p>
        </section>

        <footer className="signage-footer">
          <p className="signage-source">{t.source}</p>
          <p>{getTranslation(lang, 'scope.jmaRelay')}</p>
          <p>{getTranslation(lang, 'scope.notCovered')}</p>
        </footer>
      </div>

      <aside className="signage-side">
        <div className="signage-side-block" data-testid="signage-last-received">
          <p className="signage-side-label">{t.lastReceived}</p>
          <p className={lastReceived === null ? 'signage-side-never' : 'signage-side-time'}>
            {lastReceived === null ? t.neverReceived : formatJst(lastReceived, now)}
          </p>
        </div>
        <div className="signage-side-block">
          <p className="signage-side-lang">{t.languageName}</p>
          <p className="signage-dots" aria-hidden="true">
            {setup.langs.map((l) => (
              <span key={l} className={l === lang ? 'signage-dot signage-dot-on' : 'signage-dot'} />
            ))}
          </p>
          {setup.langs.length > 1 && <p className="signage-side-small">{t.autoRotate}</p>}
        </div>
        <div className="signage-side-block signage-qr-block">
          <QrCodeSvg text={buildPosterTargetUrl(setup.origin, setup.pref)} label={t.qrCaption} className="signage-qr" />
          <p className="signage-side-small">{t.qrCaption}</p>
        </div>
      </aside>
    </main>
  );
}

function Unavailable({ title, lastFetchedAt, t, now }: { title: string; lastFetchedAt: number | null; t: SignageStrings; now: number }) {
  return (
    <div className="signage-band signage-tone-unavailable" data-testid="signage-unavailable" role="alert">
      <div className="signage-band-main">
        <p className="signage-band-title">
          {title}: {t.unavailable}
        </p>
        <p className="signage-band-detail">
          {lastFetchedAt === null ? t.neverReceived : fillTemplate(t.lastAvailableAt, { time: formatJst(lastFetchedAt, now) })}
        </p>
      </div>
      <p className="signage-band-action">{t.unavailableDetail}</p>
    </div>
  );
}

function AlertBandView({
  band,
  lang,
  now,
  flags,
  first,
}: {
  band: AlertBand;
  lang: SignageLanguage;
  now: number;
  flags: DensityFlags;
  first: boolean;
}) {
  const t = SIGNAGE_TEXT[lang];
  const t2 = SIGNAGE_TEXT[secondLanguage(lang)];
  let title: string;
  let secondary: string;
  let detail: string;
  let action: string;
  if (band.source === 'tsunami') {
    const item: TsunamiItem = band.item;
    const key = TSUNAMI_LABEL[item.level];
    title = t[key];
    secondary = t2[key];
    const reported = parseTime(item.reportedAt);
    const epicenter = tsunamiEpicenter(item, lang);
    detail = [
      item.areaCount > 0 ? fillTemplate(t.tsunamiAreas, { n: item.areaCount }) : null,
      epicenter,
      reported !== null ? formatJst(reported, now) : null,
    ]
      .filter(Boolean)
      .join(' · ');
    action = band.tone === 'advisory' ? t.tsunamiActionAdvisory : t.tsunamiActionEvacuate;
  } else {
    const item: VolcanoItem = band.item;
    const level = item.alertLevel !== null ? ` ${fillTemplate(t.volcanoLevel, { level: item.alertLevel })}` : '';
    title = `${t.volcanoExtreme}: ${volcanoName(item, lang)}`;
    secondary = `${t2.volcanoExtreme}: ${volcanoName(item, secondLanguage(lang))}`;
    detail = `${getTranslation(lang, 'warning.specialWarning')} · ${t.volcanoTitle}${level}`;
    action = t.volcanoActionExtreme;
  }
  return (
    <div
      className={`signage-band signage-tone-${band.tone}`}
      data-testid="signage-band"
      data-tone={band.tone}
      data-pinned={String(band.pinned)}
      role={band.pinned ? 'alert' : undefined}
    >
      <div className="signage-band-main">
        <p className="signage-band-title">{title}</p>
        {!flags.hideSecondary && (
          <p className="signage-band-secondary" lang={secondLanguage(lang)}>
            {secondary}
          </p>
        )}
        {detail && !flags.hideDetail && <p className="signage-band-detail">{detail}</p>}
      </div>
      {(first || !flags.actionOnlyFirst) && <p className="signage-band-action">{action}</p>}
    </div>
  );
}

function TsunamiStatus({ view, t, now }: { view: DatasetView<TsunamiItem>; t: SignageStrings; now: number }) {
  if (view.kind === 'loading') return <p className="signage-status">{t.loading}</p>;
  if (view.kind === 'unavailable') return <Unavailable title={t.tsunamiTitle} lastFetchedAt={view.lastFetchedAt} t={t} now={now} />;
  // 「なし」は今回の取得で確認できた 0 件のときだけ（stale の空は datasetView が unavailable にしている）
  if (view.kind === 'ok' && view.items.length === 0) {
    return <p className="signage-status signage-status-ok">{t.tsunamiNone}</p>;
  }
  return null;
}

function QuakePanel({ view, lang, now }: { view: DatasetView<QuakeItem>; lang: SignageLanguage; now: number }) {
  const t = SIGNAGE_TEXT[lang];
  if (view.kind === 'loading') return <p className="signage-status">{t.loading}</p>;
  if (view.kind === 'unavailable') return <Unavailable title={t.quakeTitle} lastFetchedAt={view.lastFetchedAt} t={t} now={now} />;
  const latest = view.items[0];
  if (!latest) return <p className="signage-status">{t.quakeNone}</p>;
  const place = latest.locationJa ?? t.quakeEpicenterPending;
  const when = latest.occurredAt !== null ? formatJst(latest.occurredAt, now) : null;
  return (
    <div className="signage-quake" data-testid="signage-quake">
      <div className="signage-quake-head">
        <p className="signage-quake-title">{t.quakeTitle}</p>
        <p className="signage-quake-place">{[place, when].filter(Boolean).join(' · ')}</p>
      </div>
      {latest.magnitude !== null && <p className="signage-quake-mag">M{latest.magnitude.toFixed(1)}</p>}
      {latest.maxIntensity !== null && (
        <p className="signage-quake-int">
          <span className="signage-quake-int-label">{t.quakeMaxIntensity}</span>
          <span className="signage-quake-int-value">{formatIntensity(latest.maxIntensity, lang)}</span>
        </p>
      )}
    </div>
  );
}

const MAX_VOLCANO_NAMES = 4;

function VolcanoLine({ view, lang, now }: { view: DatasetView<VolcanoItem>; lang: SignageLanguage; now: number }) {
  const t = SIGNAGE_TEXT[lang];
  if (view.kind === 'loading') return <p className="signage-line">{t.loading}</p>;
  if (view.kind === 'unavailable') {
    return (
      <p className="signage-line signage-line-unavailable" data-testid="signage-unavailable" role="alert">
        {t.volcanoTitle}: {t.unavailable} (
        {view.lastFetchedAt === null ? t.neverReceived : fillTemplate(t.lastAvailableAt, { time: formatJst(view.lastFetchedAt, now) })})
      </p>
    );
  }
  if (view.items.length === 0) {
    return view.kind === 'ok' ? <p className="signage-line">{t.volcanoNone}</p> : null;
  }
  const others = otherVolcanoes(view.items);
  if (others.length === 0) return null;
  const names = others.slice(0, MAX_VOLCANO_NAMES).map((v) => {
    const level = v.alertLevel !== null ? ` (${fillTemplate(t.volcanoLevel, { level: v.alertLevel })})` : '';
    return `${volcanoName(v, lang)}${level}`;
  });
  const rest = others.length - names.length;
  return (
    <p className="signage-line signage-line-volcano">
      {t.volcanoOthers}: {names.join(', ')}
      {rest > 0 ? ` +${rest}` : ''}
    </p>
  );
}
