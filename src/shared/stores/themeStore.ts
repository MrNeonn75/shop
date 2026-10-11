import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'bh_theme_mode';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeToDocument(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

const savedTheme = (typeof localStorage !== 'undefined'
  ? (localStorage.getItem(STORAGE_KEY) as ThemeMode)
  : null) || 'light';

const initialResolved = savedTheme === 'system' ? getSystemTheme() : savedTheme;
applyThemeToDocument(initialResolved);

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: savedTheme,
  resolvedTheme: initialResolved,

  setTheme: (theme: ThemeMode) => {
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, theme);
    }
    applyThemeToDocument(resolved);
    set({ theme, resolvedTheme: resolved });
  },

  toggleTheme: () => {
    const current = get().resolvedTheme;
    const next = current === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
}));

