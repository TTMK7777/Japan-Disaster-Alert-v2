'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { SupportedLanguage } from '@/i18n/types';
import { getLocale, getTranslation } from '@/i18n/translations';
import type { ConversationCategory, ConversationPhrase } from '@/data/conversationPhrases';
import { conversationUiText, type ConversationUiKey } from '@/data/conversationUiText';
import {
  VISITOR_ANSWER_IDS,
  phraseById,
  staffPhrasesFor,
  staffReplyLines,
  visitorCardLines,
  visitorCategories,
  visitorPhrasesIn,
  type CardLine,
} from '@/lib/conversationCards';
import DualText, { type DualTextProps } from './conversation/DualText';
import SpeakControls from './conversation/SpeakControls';

/**
 * 会話カード: 言葉が通じない訪日客と、宿・避難所のスタッフが指で文を選んで見せ合う。
 *
 * - 「スタッフに見せる」: 訪日客がカテゴリ → 文を選ぶと、全画面で
 *   日本語（大）→ 訪日客の言語 → 英語 の 3 段で出る
 * - 「スタッフの返事」: スタッフがスタッフ→訪日客の文を選ぶと、訪日客の言語＋英語で大きく出る。
 *   そのあと訪日客は はい／いいえ／わかりません で返せる
 *
 * 訳は確認中（母語話者の確認前に組み込む。2026-10-22 ユーザー決定）。そのため文には必ず英語を添え、
 * 上部に「翻訳は確認中」の注記を出す。
 *
 * データは同梱（外部通信なし）。読み上げは端末に音声があるときだけの補助。
 * 文言の役割: 訪日客向けの文言は「利用者の言語（大）＋日本語」、スタッフ向けは「日本語（大）＋利用者の言語」。
 */

type Mode = 'visitor' | 'staff';
type Shown = { id: string; kind: 'visitor-card' | 'staff-reply' };

export interface ConversationCardsProps {
  /** 訪日客の表示言語 */
  language: SupportedLanguage;
}

const LINE_CLASS: Record<CardLine['role'], string> = {
  staff: 'text-4xl font-black leading-tight text-gray-900',
  visitor: 'text-3xl font-bold leading-snug text-gray-900',
  english: 'text-2xl font-semibold leading-snug text-gray-900',
};

const OUTLINE_BUTTON =
  'flex w-full min-h-[56px] items-center gap-3 rounded-xl border-2 border-blue-700 bg-white px-4 py-3 text-left text-blue-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300';

export default function ConversationCards({ language }: ConversationCardsProps) {
  const [mode, setMode] = useState<Mode>('visitor');
  const [category, setCategory] = useState<ConversationCategory | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [lastVisitorId, setLastVisitorId] = useState<string | null>(null);

  const ui = (key: ConversationUiKey) => conversationUiText(language, key);
  const userLocale = getLocale(language);
  const jaLocale = getLocale('ja');
  const enLocale = getLocale('en');

  /** 訪日客向け: 利用者の言語が主、日本語を添える */
  const forVisitor = (key: ConversationUiKey): DualTextProps => ({
    primary: ui(key),
    primaryLang: userLocale,
    secondary: conversationUiText('ja', key),
    secondaryLang: jaLocale,
  });
  /** スタッフ向け: 日本語が主、利用者の言語を添える */
  const forStaff = (key: ConversationUiKey): DualTextProps => ({
    primary: conversationUiText('ja', key),
    primaryLang: jaLocale,
    secondary: ui(key),
    secondaryLang: userLocale,
  });

  const shownPhrase = shown ? phraseById(shown.id) : undefined;

  // 開いただけの文は「相手の文」にしない。スタッフに渡したとき（「スタッフの返事へ」）だけ記録する
  const openVisitorCard = (id: string) => {
    setShown({ id, kind: 'visitor-card' });
  };

  /** 訪日客が見せた文をスタッフに渡す */
  const handToStaff = (id: string) => {
    setLastVisitorId(id);
    setShown(null);
    setMode('staff');
  };

  /** 「ほかの文を選ぶ」: 渡さずに閉じた文は相手の文として残さない */
  const closeVisitorCard = () => {
    setLastVisitorId(null);
    setShown(null);
  };

  const goStaff = () => {
    setShown(null);
    setMode('staff');
  };

  const goVisitor = () => {
    setShown(null);
    setMode('visitor');
  };

  const lastVisitorPhrase = lastVisitorId ? phraseById(lastVisitorId) : undefined;

  return (
    <div className="bg-gray-50 text-gray-900">
      {/* 訳は母語話者の確認前。利用者の言語＋日本語（スタッフにも分かるように） */}
      <p data-testid="conv-review-note" className="mb-3 text-xs text-gray-700">
        <DualText
          primary={getTranslation(language, 'conversation.reviewNote')}
          primaryLang={userLocale}
          secondary={getTranslation('ja', 'conversation.reviewNote')}
          secondaryLang={jaLocale}
          secondaryClassName="block"
        />
      </p>
      <div className="mb-4 grid grid-cols-2 gap-2" role="group">
        <ModeButton testId="conv-mode-visitor" active={mode === 'visitor'} onClick={goVisitor}>
          <DualText {...forVisitor('modeVisitor')} primaryClassName="block text-base font-bold" secondaryClassName="block text-xs" />
        </ModeButton>
        <ModeButton testId="conv-mode-staff" active={mode === 'staff'} onClick={goStaff}>
          <DualText {...forStaff('modeStaff')} primaryClassName="block text-base font-bold" secondaryClassName="block text-xs" />
        </ModeButton>
      </div>

      {mode === 'visitor' ? (
        category === null ? (
          <section>
            <h2 className="mb-3 text-2xl font-bold">
              <DualText {...forVisitor('chooseTopic')} secondaryClassName="block text-base font-medium text-gray-700" />
            </h2>
            <ul data-testid="conv-categories" className="grid gap-2">
              {visitorCategories().map((cat, i) => (
                <li key={cat}>
                  <button type="button" data-category={cat} onClick={() => setCategory(cat)} className={OUTLINE_BUTTON}>
                    <span aria-hidden="true" className="w-7 shrink-0 text-center text-lg font-bold text-blue-800">
                      {i + 1}
                    </span>
                    <DualText
                      {...forVisitor(`category.${cat}` as ConversationUiKey)}
                      primaryClassName="block text-xl font-bold text-gray-900"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section>
            <button type="button" data-testid="conv-back" onClick={() => setCategory(null)} className={`${OUTLINE_BUTTON} mb-3`}>
              <span aria-hidden="true" className="text-xl font-bold">←</span>
              <DualText {...forVisitor('back')} primaryClassName="block text-lg font-bold" />
            </button>
            <h2 className="mb-3 text-2xl font-bold">
              <DualText
                {...forVisitor(`category.${category}` as ConversationUiKey)}
                secondaryClassName="block text-base font-medium text-gray-700"
              />
            </h2>
            <ul data-testid="conv-phrase-list" className="grid gap-2">
              {visitorPhrasesIn(category).map((p) => (
                <li key={p.id}>
                  <button type="button" data-phrase-id={p.id} onClick={() => openVisitorCard(p.id)} className={OUTLINE_BUTTON}>
                    <DualText
                      primary={p.text[language]}
                      primaryLang={userLocale}
                      secondary={p.text.ja}
                      secondaryLang={jaLocale}
                      tertiary={p.text.en}
                      tertiaryLang={enLocale}
                      primaryClassName="block text-xl font-bold text-gray-900"
                      secondaryClassName="block text-base text-gray-700"
                      tertiaryClassName="block text-base text-gray-700"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      ) : (
        <section>
          <h2 className="mb-1 text-2xl font-bold">
            <DualText {...forStaff('modeStaff')} secondaryClassName="block text-base font-medium text-gray-700" />
          </h2>
          <p className="mb-3 text-base text-gray-800">
            <DualText {...forStaff('confirmedOnly')} primaryClassName="block font-bold" />
          </p>

          {lastVisitorPhrase && (
            <div data-testid="conv-visitor-said" className="mb-3 rounded-xl border border-gray-300 bg-gray-100 px-4 py-3">
              <p className="text-sm text-gray-700">
                <DualText {...forStaff('visitorSaid')} primaryClassName="inline" secondaryClassName="ml-2 inline" />
              </p>
              <p lang={jaLocale} className="text-2xl font-bold text-gray-900">
                {lastVisitorPhrase.text.ja}
              </p>
              {lastVisitorPhrase.text[language] !== lastVisitorPhrase.text.ja && (
                <p lang={userLocale} className="text-base text-gray-700">
                  {lastVisitorPhrase.text[language]}
                </p>
              )}
              {language !== 'en' && lastVisitorPhrase.text.en !== lastVisitorPhrase.text.ja && (
                <p lang={enLocale} className="text-base text-gray-700">
                  {lastVisitorPhrase.text.en}
                </p>
              )}
            </div>
          )}

          <ul data-testid="conv-staff-list" className="grid gap-2">
            {staffPhrasesFor(lastVisitorPhrase?.category ?? null).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  data-phrase-id={p.id}
                  onClick={() => setShown({ id: p.id, kind: 'staff-reply' })}
                  className={OUTLINE_BUTTON}
                >
                  <DualText
                    primary={p.text.ja}
                    primaryLang={jaLocale}
                    secondary={p.text[language]}
                    secondaryLang={userLocale}
                    tertiary={p.text.en}
                    tertiaryLang={enLocale}
                    primaryClassName="block text-xl font-bold text-gray-900"
                    secondaryClassName="block text-base text-gray-700"
                    tertiaryClassName="block text-base text-gray-700"
                  />
                  <span aria-hidden="true" className="ml-auto text-2xl font-bold">›</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-gray-700">
            <DualText {...forStaff('tapToEnlarge')} />
          </p>
          <button type="button" data-testid="conv-back-to-visitor" onClick={goVisitor} className={`${OUTLINE_BUTTON} mt-3 justify-center`}>
            <span aria-hidden="true" className="text-xl font-bold">←</span>
            <DualText {...forStaff('backToVisitor')} primaryClassName="block text-lg font-bold" />
          </button>
          <p className="mt-3 rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-800">
            <DualText {...forStaff('noRecording')} />
          </p>
        </section>
      )}

      {shown && shownPhrase && (
        <PhraseDialog
          key={`${shown.kind}-${shown.id}`}
          label={ui(shown.kind === 'visitor-card' ? 'modeVisitor' : 'staffSays')}
          onClose={shown.kind === 'visitor-card' ? closeVisitorCard : () => setShown(null)}
        >
          {shown.kind === 'visitor-card' ? (
            <VisitorCard
              phrase={shownPhrase}
              language={language}
              ui={{ forVisitor, forStaff }}
              onStaffReply={() => handToStaff(shown.id)}
              onClose={closeVisitorCard}
            />
          ) : (
            <StaffReply
              phrase={shownPhrase}
              language={language}
              ui={{ forVisitor, forStaff }}
              onAnswer={openVisitorCard}
              onClose={() => setShown(null)}
            />
          )}
        </PhraseDialog>
      )}
    </div>
  );
}

function ModeButton({
  testId,
  active,
  onClick,
  children,
}: {
  testId: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-[56px] rounded-xl border-2 border-blue-800 px-3 py-2 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${
        active ? 'bg-blue-800 text-white' : 'bg-white text-blue-800'
      }`}
    >
      {children}
    </button>
  );
}

/** 全画面のカード。Esc でも閉じる。開いたら見出しにフォーカスを移す */
function PhraseDialog({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') onClose();
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      ref={ref}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-white text-gray-900 focus:outline-none"
    >
      <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 px-4 py-5">{children}</div>
    </div>
  );
}

type UiHelpers = {
  forVisitor: (key: ConversationUiKey) => DualTextProps;
  forStaff: (key: ConversationUiKey) => DualTextProps;
};

function Lines({ lines }: { lines: CardLine[] }) {
  return (
    <>
      {lines.map((line) => (
        <p
          key={line.lang}
          data-line-role={line.role}
          lang={getLocale(line.lang)}
          className={`${LINE_CLASS[line.role]} break-words hyphens-auto`}
        >
          {line.text}
        </p>
      ))}
    </>
  );
}

function VisitorCard({
  phrase,
  language,
  ui,
  onStaffReply,
  onClose,
}: {
  phrase: ConversationPhrase;
  language: SupportedLanguage;
  ui: UiHelpers;
  onStaffReply: () => void;
  onClose: () => void;
}) {
  const lines = visitorCardLines(phrase, language);
  return (
    <>
      <p className="text-base font-bold text-gray-800">
        <DualText {...ui.forVisitor('modeVisitor')} />
      </p>
      <div className="rounded-2xl border-2 border-blue-700 bg-white px-4 py-5">
        <div className="flex flex-col gap-3">
          <Lines lines={lines} />
        </div>
        <p className="mt-3 text-sm text-gray-700">{phrase.id}</p>
      </div>
      <SpeakControls
        text={phrase.text.ja}
        locale={getLocale('ja')}
        readAloud={ui.forVisitor('readAloud')}
        stop={ui.forVisitor('stop')}
        noVoice={ui.forVisitor('noVoice')}
      />
      <button type="button" data-testid="conv-to-staff" onClick={onStaffReply} className={`${OUTLINE_BUTTON} justify-center`}>
        <DualText {...ui.forVisitor('staffReplyHere')} primaryClassName="block text-lg font-bold" />
        <span aria-hidden="true" className="text-xl font-bold">→</span>
      </button>
      <button type="button" data-testid="conv-close" onClick={onClose} className={`${OUTLINE_BUTTON} justify-center`}>
        <DualText {...ui.forVisitor('chooseAnother')} primaryClassName="block text-lg font-bold" />
      </button>
    </>
  );
}

function StaffReply({
  phrase,
  language,
  ui,
  onAnswer,
  onClose,
}: {
  phrase: ConversationPhrase;
  language: SupportedLanguage;
  ui: UiHelpers;
  onAnswer: (id: string) => void;
  onClose: () => void;
}) {
  const { large, reference } = staffReplyLines(phrase, language);
  const answers = VISITOR_ANSWER_IDS.map((id) => phraseById(id)).filter(
    (p): p is ConversationPhrase => p !== undefined
  );
  return (
    <>
      <p className="text-base font-bold text-gray-800">
        <DualText {...ui.forVisitor('staffSays')} />
      </p>
      <div className="rounded-2xl border-2 border-blue-700 bg-white px-4 py-5">
        <div className="flex flex-col gap-3">
          {large.map((line) => (
            <p
              key={line.lang}
              data-line-role={line.role}
              lang={getLocale(line.lang)}
              className={`${line.role === 'english' && large.length > 1 ? LINE_CLASS.english : 'text-4xl font-black leading-tight text-gray-900'} break-words hyphens-auto`}
            >
              {line.text}
            </p>
          ))}
        </div>
        {reference && (
          <p
            data-line-role="staff"
            lang={getLocale('ja')}
            className="mt-4 border-t border-gray-300 pt-3 text-lg text-gray-700 break-words"
          >
            {reference.text}
          </p>
        )}
        <p className="mt-3 text-sm text-gray-700">{phrase.id}</p>
      </div>
      <SpeakControls
        text={phrase.text[language]}
        locale={getLocale(language)}
        readAloud={ui.forVisitor('readAloud')}
        stop={ui.forVisitor('stop')}
        noVoice={ui.forVisitor('noVoice')}
      />
      <section>
        <h3 className="mb-2 text-lg font-bold">
          <DualText {...ui.forVisitor('answer')} />
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {answers.map((p) => (
            <button
              key={p.id}
              type="button"
              data-answer-id={p.id}
              onClick={() => onAnswer(p.id)}
              className="min-h-[64px] rounded-xl border-2 border-blue-700 bg-white px-2 py-2 text-center text-blue-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
            >
              <DualText
                primary={p.text[language]}
                primaryLang={getLocale(language)}
                secondary={p.text.ja}
                secondaryLang={getLocale('ja')}
                tertiary={p.text.en}
                tertiaryLang={getLocale('en')}
                primaryClassName="block text-lg font-bold"
              />
            </button>
          ))}
        </div>
      </section>
      <button type="button" data-testid="conv-close" onClick={onClose} className={`${OUTLINE_BUTTON} justify-center`}>
        <DualText {...ui.forStaff('chooseAnother')} primaryClassName="block text-lg font-bold" />
      </button>
    </>
  );
}
