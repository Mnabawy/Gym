# Gym App

Personal workout + nutrition app for one user. Arabic UI, RTL, Egyptian dialect copy.
Exercise names stay in English (gym vocabulary).

## Stack
- Expo SDK 58, TypeScript strict, expo-router (routes in `src/app/`, tabs in `src/app/(tabs)/`)
- State: zustand (`src/lib/timer.ts`, `src/lib/bus.ts`)
- Storage: expo-sqlite on iOS/Android (`src/lib/storage.ts`), localStorage on web (`src/lib/storage.web.ts`), same `Storage` interface
- expo-haptics, expo-keep-awake, expo-notifications (rest timer when backgrounded), expo-clipboard
- Fonts: Readex Pro (Arabic) + Inter (numbers/Latin) via @expo-google-fonts
- No backend. Offline-first.

## Design rules
- RTL forced (expo-localization plugin `forcesRTL` + I18nManager in root layout). Use `start/end`, never `left/right`.
- One fixed color per muscle (Okabe–Ito, colorblind-safe) in `src/theme/index.ts`.
- Technique tags: تقيل (filled), فشل (outlined), دروب (dashed). Copy in `src/data/rules.ts`.
- Food chip colors: protein blue, carbs orange, fat green, veg grey.
- Light + dark from one token file. Touch targets ≥ 44pt.

## Data
- `src/data/program.ts` — the 5-day program (edit here to change exercises)
- `src/data/nutrition.ts`, `src/data/shopping.ts` — generated from the nutrition plan / shopping list PDFs
- Source PDFs live in `docs/`

## Commands
- `npx expo start` — run
- `npm test` — unit tests for pure logic (`src/lib/logic.ts`, data integrity)
- `npm run typecheck`
- `npx expo install <pkg>` — always, for SDK-compatible versions
