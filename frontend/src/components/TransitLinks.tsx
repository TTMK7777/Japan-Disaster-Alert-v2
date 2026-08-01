'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';

/**
 * 災害時に確認すべき交通の公式情報源。
 *
 * 訪日客の災害時ニーズ調査で「日程が崩壊した」37.3%・「交通と空港の情報」22.2% と
 * 交通が上位に集中しているのに、アプリには交通のデータ源が1つも無かった。
 * 運行情報そのものの配信は各社 API のライセンス調査が要るため、
 * まず「どこを見ればよいか」を示して空白を埋める。
 *
 * 見出しは16言語ぶんバックエンドが返す。事業者名・空港名は固有名詞なので訳さない
 * （駅や空港の案内表示に出る正式表記のまま出す方が現地で照合できる）。
 */

interface TransitLink {
  id: string;
  name: string;
  url: string;
  languages: string[];
  readable_in_user_language: boolean;
  area: string;
}

interface TransitGroup {
  category: string;
  label: string;
  links: TransitLink[];
}

interface TransitLinksResponse {
  title: string;
  available_in_label: string;
  groups: TransitGroup[];
}

interface TransitLinksProps {
  language: string;
}

export default function TransitLinks({ language }: TransitLinksProps) {
  const [data, setData] = useState<TransitLinksResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/transit-links?lang=${encodeURIComponent(language)}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json: TransitLinksResponse = await response.json();
        if (!cancelled) {
          setData(json);
          setFailed(false);
        }
      } catch {
        // 取得できなくてもページ全体は壊さない。この節を出さないだけにする
        if (!cancelled) setFailed(true);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [language]);

  if (failed || !data) return null;

  return (
    <section className="mt-6" aria-labelledby="transit-links-heading">
      <h2
        id="transit-links-heading"
        className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3"
      >
        {data.title}
      </h2>

      <div className="space-y-4">
        {data.groups.map((group) => (
          <div key={group.category}>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
              {group.label}
            </h3>
            <ul className="space-y-2">
              {group.links.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.url}
                    target="_blank"
                    // 外部サイトに開き元の window オブジェクトを渡さない
                    rel="noopener noreferrer"
                    // 44px のタッチターゲット（WCAG 2.1 AA）
                    className="block min-h-[44px] rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
                  >
                    <span className="block font-medium text-gray-900 dark:text-gray-100">
                      {link.name}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {link.area}
                    </span>

                    {/* 自分の言語で読めないリンクは、開く前に分かるようにする。
                        災害のさなかに読めないページを開かせて時間を奪わないため。
                        名前の**下**に置く。横に並べると対応言語が5つある空港で
                        施設名が3行に潰れた（390px 幅の実機スクショで確認） */}
                    {!link.readable_in_user_language && (
                      <span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {data.available_in_label}: {link.languages.join(', ')}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
