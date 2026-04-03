import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';

import { SUPPORTED_LOCALES, translations, type SupportedLocale } from './translations';

const STORAGE_KEY = 'ogwu:locale';

export const i18n = new I18n(translations);

i18n.enableFallback = true;

i18n.defaultLocale = 'en';

type LocaleState = {
  locale: SupportedLocale;
  isInitialized: boolean;
};

let state: LocaleState = {
  locale: 'en',
  isInitialized: false,
};

function normalizeLocaleTag(tag: string): SupportedLocale {
  const lower = tag.toLowerCase();
  const base = lower.split(/[-_]/)[0] as SupportedLocale;
  if (SUPPORTED_LOCALES.includes(base)) return base;
  return 'en';
}

function getDeviceLocale(): SupportedLocale {
  const tag = Localization.getLocales?.()?.[0]?.languageTag;
  if (tag) return normalizeLocaleTag(tag);

  const fallback = (Localization as any).locale as string | undefined;
  if (fallback) return normalizeLocaleTag(fallback);

  return 'en';
}

export async function initI18n(): Promise<SupportedLocale> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  const initial = stored ? normalizeLocaleTag(stored) : getDeviceLocale();
  setLocaleSync(initial);
  state.isInitialized = true;
  return initial;
}

function setLocaleSync(locale: SupportedLocale) {
  state.locale = locale;
  i18n.locale = locale;
}

export function getLocale(): SupportedLocale {
  return state.locale;
}

export async function setLocale(locale: SupportedLocale): Promise<void> {
  setLocaleSync(locale);
  await AsyncStorage.setItem(STORAGE_KEY, locale);
}

export function t(key: string, options?: Record<string, any>): string {
  return i18n.t(key, options);
}

export const languageLabels: Record<SupportedLocale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  ig: 'Igbo',
  yo: 'Yorùbá',
  ha: 'Hausa',
};
