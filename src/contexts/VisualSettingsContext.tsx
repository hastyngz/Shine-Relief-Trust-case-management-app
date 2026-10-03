import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

export type ThemeId =
  | 'shine'
  | 'electric-coral'
  | 'tropical-punch'
  | 'sunset-pop'
  | 'kelly-gold'
  | 'cobalt-citrus'
  | 'berry-mint'
  | 'fire-violet'
  | 'vibrant-shine';

export type MobileViewMode = 'classic' | 'ios';

const DEFAULT_THEME: ThemeId = 'sunset-pop';
const DEFAULT_MOBILE_VIEW_MODE: MobileViewMode = 'classic';
const DEFAULT_GLASS_EFFECT = false;
const DEFAULT_ANIMATED_GLASS = false;

export interface VisualSettings {
  theme: ThemeId;
  glassEffect: boolean;
  mobileViewMode: MobileViewMode;
}

export interface ThemeOption {
  id: ThemeId;
  name: string;
  primary: string;
  accent: string;
}

export const themes: ThemeOption[] = [
  { id: 'shine', name: 'SHINE brand, true', primary: '#0b3d33', accent: '#f5a623' },
  { id: 'electric-coral', name: 'Electric coral', primary: '#ff5a4e', accent: '#0f766e' },
  { id: 'tropical-punch', name: 'Tropical punch', primary: '#e6317a', accent: '#1fc7d4' },
  { id: 'sunset-pop', name: 'Sunset pop', primary: '#ff7a1a', accent: '#5b2a86' },
  { id: 'kelly-gold', name: 'Kelly and gold', primary: '#0c3b2e', accent: '#f5b700' },
  { id: 'cobalt-citrus', name: 'Cobalt and citrus', primary: '#1857d6', accent: '#ffe14d' },
  { id: 'berry-mint', name: 'Berry and mint', primary: '#d6266b', accent: '#2de6a6' },
  { id: 'fire-violet', name: 'Fire and violet', primary: '#ef4131', accent: '#6d28d9' },
  { id: 'vibrant-shine', name: 'Vibrant SHINE', primary: '#0e8f6d', accent: '#ff9d0f' },
];

interface VisualSettingsContextValue {
  mobileViewMode: MobileViewMode;
  setMobileViewMode: (mode: MobileViewMode) => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  glassEffect: boolean;
  setGlassEffect: (enabled: boolean) => void;
  animatedGlass: boolean;
  setAnimatedGlass: (enabled: boolean) => void;
}

const VisualSettingsContext = createContext<VisualSettingsContextValue | undefined>(undefined);

export const VisualSettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [mobileViewMode, setMobileViewMode] = useState<MobileViewMode>(DEFAULT_MOBILE_VIEW_MODE);
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [glassEffect, setGlassEffect] = useState(DEFAULT_GLASS_EFFECT);
  const [animatedGlass, setAnimatedGlass] = useState(DEFAULT_ANIMATED_GLASS);
  const [loadedSettingsKey, setLoadedSettingsKey] = useState<string | null>(null);
  const settingsKey = `shine_visual_settings_${currentUser?.uid || 'guest'}`;

  useEffect(() => {
    let saved: Partial<VisualSettings> = {};
    try {
      const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(settingsKey);
      if (raw) saved = JSON.parse(raw) as Partial<VisualSettings>;
    } catch {
      saved = {};
    }
    const restoredTheme = themes.some((option) => option.id === saved.theme) ? saved.theme! : DEFAULT_THEME;
    const restoredGlass = typeof saved.glassEffect === 'boolean' ? saved.glassEffect : DEFAULT_GLASS_EFFECT;
    const restoredMobileViewMode =
      saved.mobileViewMode === 'ios' || saved.mobileViewMode === 'classic'
        ? saved.mobileViewMode
        : DEFAULT_MOBILE_VIEW_MODE;
    setTheme(restoredTheme);
    setGlassEffect(restoredGlass);
    setAnimatedGlass(restoredGlass);
    setMobileViewMode(restoredMobileViewMode);
    setLoadedSettingsKey(settingsKey);
  }, [settingsKey]);

  useEffect(() => {
    if (loadedSettingsKey !== settingsKey || typeof window === 'undefined') return;
    window.localStorage.setItem(settingsKey, JSON.stringify({ theme, glassEffect, mobileViewMode } satisfies VisualSettings));
  }, [settingsKey, loadedSettingsKey, theme, glassEffect, mobileViewMode]);

  useEffect(() => {
    setAnimatedGlass(glassEffect);
  }, [glassEffect]);

  return (
    <VisualSettingsContext.Provider value={{
      mobileViewMode,
      setMobileViewMode,
      theme,
      setTheme,
      glassEffect,
      setGlassEffect,
      animatedGlass,
      setAnimatedGlass,
    }}>
      {children}
    </VisualSettingsContext.Provider>
  );
};

export function useVisualSettings(): VisualSettingsContextValue {
  const context = useContext(VisualSettingsContext);
  if (!context) {
    throw new Error('useVisualSettings must be used within a VisualSettingsProvider');
  }
  return context;
}