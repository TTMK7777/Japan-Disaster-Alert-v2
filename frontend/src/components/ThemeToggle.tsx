'use client';

interface ThemeToggleProps {
  theme: 'light' | 'dark' | 'system';
  onToggle: () => void;
}

export default function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const icons = { light: '\u2600', dark: '\u263E', system: '\u25D0' };
  const labels = { light: 'Light', dark: 'Dark', system: 'Auto' };

  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-center gap-1 p-2 min-h-[44px] min-w-[44px] rounded-lg bg-white/20 text-white border border-white/30 hover:bg-white/30 transition-colors text-sm"
      aria-label={`Theme: ${labels[theme]}`}
      title={`Theme: ${labels[theme]}`}
    >
      <span aria-hidden="true">{icons[theme]}</span>
    </button>
  );
}
