// The app's sections: الجيم (the tabs), العادات, الأهداف, بطّل, مهامي. The app opens on the home page (/sections), which
// switches between them; meta `section` = the one you were in last. Pomodoro is no longer a section (a stored 'focus' opens مهامي).
import { router } from 'expo-router';
import { HABITS_OFF } from './hidden';
import { storage } from './storage';

export const SECTION_KEY = 'section';
export type Section = 'gym' | 'habits' | 'goals' | 'quit' | 'tasks' | 'focus';
export const SECTION_PATH = { gym: '/', habits: '/habits', goals: '/goals', quit: '/quit', tasks: '/tasks', focus: '/focus' } as const;

export const lastSection = (): Section => {
  const s = storage.getMeta(SECTION_KEY);
  if (s === 'focus') return 'tasks';
  return (s === 'habits' && !HABITS_OFF) || s === 'goals' || s === 'quit' || s === 'tasks' ? s : 'gym';
};

/** Opens a section in place of the one you're in (so back doesn't bounce between sections). */
export function openSection(s: Section) {
  storage.setMeta(SECTION_KEY, s);
  if (router.canDismiss()) router.dismissAll();
  router.replace(SECTION_PATH[s]);
}


// The home page (/sections) is what the app opens on: it's shown once per launch, then the tabs open the gym.
let seen = false;
export const hubWasSeen = () => seen;
export const hubSeen = () => {
  seen = true;
};
