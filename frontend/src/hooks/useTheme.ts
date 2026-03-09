'use client';

import { useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

/**
 * テーマ管理フック
 * - localStorage にユーザー設定を保存
 * - system モードではOS設定に追従
 * - <html> 要素に 'dark' クラスを付与/除去
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Apply theme to <html> element
  const applyTheme = useCallback((isDark: boolean) => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    setResolvedTheme(isDark ? 'dark' : 'light');
  }, []);

  // Initialize from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setThemeState(stored);
    }
  }, []);

  // Apply theme changes
  useEffect(() => {
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      applyTheme(theme === 'dark');
    }
  }, [theme, applyTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  }, []);

  return { theme, resolvedTheme, setTheme };
}
