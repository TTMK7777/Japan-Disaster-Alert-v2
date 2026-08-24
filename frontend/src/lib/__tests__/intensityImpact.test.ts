/**
 * 震度別のインフラ影響が、気象庁の閾値どおりであることを固定する。
 *
 * 出典: 気象庁「震度階級関連解説表」（平成21年3月31日改訂）
 *       「ライフライン・インフラ等への影響」
 *
 * 閾値を1段でも間違えると、実際には起きないことを「起きます」と伝える（誇張）か、
 * 起きることを伝え損なう（過小）かのどちらかになる。
 */
import { describe, it, expect } from 'vitest';
import { impactsFor, hasImpact, intensityRank } from '../intensityImpact';

describe('気象庁の閾値', () => {
  it('鉄道・高速道路は震度4から（3では出ない）', () => {
    expect(impactsFor('3')).not.toContain('transit');
    expect(impactsFor('4')).toContain('transit');
  });

  it('ガス・断水停電・エレベーターは震度5弱から（4では出ない）', () => {
    for (const key of ['gas', 'utility', 'elevator'] as const) {
      expect(impactsFor('4'), `${key} が震度4で出ている`).not.toContain(key);
      expect(impactsFor('5弱'), `${key} が震度5弱で出ていない`).toContain(key);
    }
  });

  it('災害用伝言サービスは震度6弱から（5強では出ない）', () => {
    expect(impactsFor('5強')).not.toContain('messageService');
    expect(impactsFor('6弱')).toContain('messageService');
  });

  it('広域の供給停止は震度6強から（6弱では出ない）', () => {
    expect(impactsFor('6弱')).not.toContain('widespread');
    expect(impactsFor('6強')).toContain('widespread');
  });
});

describe('累積すること', () => {
  it('震度7では震度4の項目も該当したまま', () => {
    // 原文は「震度4程度以上」なので、上位の震度でも該当し続ける。
    // 震度7の場面でも「電車が動くか」は利用者に最も切実な情報のひとつ
    expect(impactsFor('7')).toContain('transit');
  });

  it('震度が上がるほど項目は減らない', () => {
    const ladder = ['1', '2', '3', '4', '5弱', '5強', '6弱', '6強', '7'];
    let previous = 0;
    for (const intensity of ladder) {
      const count = impactsFor(intensity).length;
      expect(count, `${intensity} で項目が減っている`).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
  });

  it('震度7では6項目すべてが該当する', () => {
    expect(impactsFor('7')).toHaveLength(6);
  });
});

describe('出さない場合', () => {
  it.each(['1', '2', '3'])('震度%sでは何も出さない', (intensity) => {
    // 閾値に届かないものを出せば誇張になる
    expect(impactsFor(intensity)).toEqual([]);
    expect(hasImpact(intensity)).toBe(false);
  });

  it('震度不明では出さない', () => {
    // 速報段階・海外震源では震度が取れない。
    // 推定して出すと根拠のない情報になる
    expect(impactsFor('不明')).toEqual([]);
    expect(impactsFor('')).toEqual([]);
    expect(impactsFor('Unknown')).toEqual([]);
    expect(hasImpact('不明')).toBe(false);
    expect(intensityRank('不明')).toBeNull();
  });
});

describe('解説表に無いものを出さない', () => {
  it('項目は気象庁の5行＋脚注に由来する6種だけ', () => {
    // 空港・一般道・上下水道の復旧見込み・信号機・ATM・店舗・避難所開設は
    // 解説表に記載が無い。気象庁由来として出せば出典の詐称になる
    const all = new Set(impactsFor('7'));
    expect(all).toEqual(
      new Set(['transit', 'gas', 'utility', 'elevator', 'messageService', 'widespread'])
    );
  });
});
