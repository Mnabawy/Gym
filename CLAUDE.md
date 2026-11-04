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
- `src/data/program.ts` — the 5-day program (edit here to change exercises). Sets and rest can be changed in the app's settings page (`/settings`, gear on the workout tab); `applyPlan` writes those onto `PROGRAM` in place so every screen reads the same plan
- `src/lib/settings.ts` — settings store (zustand), saved as JSON under storage meta key `settings`
- `src/lib/prayer.ts` (times, adhan, offline) + `src/lib/place.ts` (phone location, expo-location) — prayer times tab `(tabs)/prayer.tsx`, shown only when turned on in settings
- `src/lib/energy.ts` — calorie/macro calculator (`/calories`, from the food tab header or settings); formulas and sources at the top of the file
- `src/lib/shop.ts` — splits the weekly shopping list into N trips (settings) by the days each item is eaten; pantry items are bought once
- `src/data/nutrition.ts`, `src/data/shopping.ts` — generated from the nutrition plan / shopping list PDFs
- `src/data/verses.ts` — Quran verses for the launch popup (`src/components/VersePopup.tsx`). Tanzil Uthmani text copied verbatim from api.alquran.cloud; never retype or edit a verse by hand
- Source PDFs live in `docs/`
- `src/lib/gaps.ts` — gaps dashboard (`/gaps`) and calendar (`/attendance`) logic; thresholds and their sources are at the top of the file

## Commands
- `npx expo start` — run
- `npm test` — unit tests for pure logic (`src/lib/logic.ts`, `src/lib/gaps.ts`, `src/lib/shop.ts`, `src/lib/energy.ts`, `src/lib/prayer.ts`, settings, data integrity)
- `npm run typecheck`
- `npx expo install <pkg>` — always, for SDK-compatible versions
