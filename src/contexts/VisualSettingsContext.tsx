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
  mobileView: boolean;
  setMobileView: (enabled: boolean) => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  animatedGlass: boolean;
  setAnimatedGlass: (enabled: boolean) => void;
}

const VisualSettingsContext = createContext<VisualSettingsContextValue | undefined>(undefined);

export const VisualSettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [mobileView, setMobileView] = useState(false);
  const [theme, setTheme] = useState<ThemeId>('shine');
  const [animatedGlass, setAnimatedGlass] = useState(false);

  useEffect(() => {
    setMobileView(false);
    setTheme('shine');
    setAnimatedGlass(false);
  }, [currentUser?.uid]);

  return (
    <VisualSettingsContext.Provider value={{
      mobileView,
      setMobileView,
      theme,
      setTheme,
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