// The app's sections (أقسامك): الجيم (the tabs), العادات, الأهداف. The app opens on the last one you were in
// (meta `section`); the sections page (/sections) switches between them.
import { router } from 'expo-router';
import { storage } from './storage';

export const SECTION_KEY = 'section';
export type Section = 'gym' | 'habits' | 'goals';
export const SECTION_PATH = { gym: '/', habits: '/habits', goals: '/goals' } as const;

export const lastSection = (): Section => {
  const s = storage.getMeta(SECTION_KEY);
  return s === 'habits' || s === 'goals' ? s : 'gym';
};

/** Opens a section in place of the one you're in (so back doesn't bounce between sections). */
export function openSection(s: Section) {
  storage.setMeta(SECTION_KEY, s);
  if (router.canDismiss()) router.dismissAll();
  router.replace(SECTION_PATH[s]);
}

