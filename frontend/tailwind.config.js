/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  // src 配下を丸ごと走査する。従来は pages / components / app の 3 つだけを見ており、
  // src/lib や src/i18n にクラス名を書くと **CSS が生成されないまま黙って背景が消える**。
  // ユニットテストでも型チェックでも検知できない失敗なので、範囲を絞らない。
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        'disaster-red': '#dc2626',
        'disaster-orange': '#ea580c',
        'disaster-yellow': '#ca8a04',
        'disaster-blue': '#2563eb',
        'disaster-green': '#16a34a',
      },
    },
  },
  plugins: [],
};
