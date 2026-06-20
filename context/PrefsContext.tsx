import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Prefs {
  compactLayout: boolean;
  showWeekNumbers: boolean;
  notifyReminders: boolean;
  notifyCircles: boolean;
  notifyAI: boolean;
  useGroq: boolean;
  groqApiKey: string;
}

interface PrefsContextValue {
  prefs: Prefs;
  setPref: (key: keyof Prefs, value: any) => void;
  toggle: (key: keyof Prefs) => void;
  loaded: boolean;
}

const STORAGE_KEY = '@scheduly/prefs';

const DEFAULTS: Prefs = {
  compactLayout: false,
  showWeekNumbers: false,
  notifyReminders: true,
  notifyCircles: true,
  notifyAI: false,
  useGroq: false,
  groqApiKey: '',
};

const PrefsContext = createContext<PrefsContextValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(stored => {
      if (stored) {
        setPrefs(prev => ({ ...prev, ...JSON.parse(stored) }));
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    }
  }, [prefs, loaded]);

  const setPref = (key: keyof Prefs, value: any) => setPrefs(p => ({ ...p, [key]: value }));
  const toggle = (key: keyof Prefs) => setPrefs(p => ({ ...p, [key]: !p[key] }));

  return (
    <PrefsContext.Provider value={{ prefs, setPref, toggle, loaded }}>
      {children}
    </PrefsContext.Provider>
  );
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return ctx;
}
