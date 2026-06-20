import React, { createContext, ReactNode, useContext, useMemo, useState } from 'react';

type ThemeMode = 'dark' | 'light';

function buildPalette(mode: ThemeMode) {
  return mode === 'dark' ? {
    mode: 'dark' as ThemeMode,
    background: '#080B14',
    surface: '#0F172A',
    surfaceAlt: '#111827',
    border: '#243149',
    text: '#F1F5F9',
    muted: '#94A3B8',
    faint: '#64748B',
    accent: '#5EEAD4',
    accentStrong: '#2DD4BF',
    accentSoft: '#2DD4BF20',
    onAccent: '#0F172A',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    overlay: 'rgba(0,0,0,0.75)',
    statusBar: 'light' as const,
  } : {
    mode: 'light' as ThemeMode,
    background: '#F6F8FB',
    surface: '#FFFFFF',
    surfaceAlt: '#F1F5F9',
    border: '#E2E8F0',
    text: '#0F172A',
    muted: '#64748B',
    faint: '#94A3B8',
    accent: '#0F766E',
    accentStrong: '#115E59',
    accentSoft: '#0F766E15',
    onAccent: '#FFFFFF',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    overlay: 'rgba(15,23,42,0.38)',
    statusBar: 'dark' as const,
  };
}

export type AppPalette = ReturnType<typeof buildPalette>;

interface ThemeContextValue {
  colors: AppPalette;
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [darkMode, setDarkMode] = useState(false);
  const colors = useMemo(() => buildPalette(darkMode ? 'dark' : 'light'), [darkMode]);
  const value = useMemo(() => ({ colors, darkMode, setDarkMode }), [colors, darkMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used inside <AppThemeProvider>');
  return ctx;
}
