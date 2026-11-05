# Gym App

Personal workout + nutrition app for one user. Arabic UI, RTL, Egyptian dialect copy.
Exercise names stay in English (gym vocabulary).

## Stack
- Expo SDK 58, TypeScript strict, expo-router (routes in `src/app/`, tabs in `src/app/(tabs)/`)
- State: zustand (`src/lib/timer.ts`, `src/lib/bus.ts`)
- Storage: expo-sqlite on iOS/Android (`src/lib/storage.ts`), localStorage on web (`src/lib/storage.web.ts`), same `Storage` interface
- expo-haptics, expo-keep-awake, expo-notifications (rest timer when backgrounded), expo-clipboard, expo-location (prayer times), react-native-webview (form videos play in-app; `YouTubePlayer.web.tsx` is a plain iframe)
- Fonts: Readex Pro (Arabic) + Inter (numbers/Latin) via @expo-google-fonts
- No backend. Offline-first.

## Design rules
- RTL forced (expo-localization plugin `forcesRTL` + I18nManager in root layout). Use `start/end`, never `left/right`.
- One fixed color per muscle (Okabe–Ito, colorblind-safe) in `src/theme/index.ts`.
- Technique tags: تقيل (filled), فشل (outlined), دروب (dashed). Copy in `src/data/rules.ts`.
- Food chip colors: protein blue, carbs orange, fat green, veg grey.
- Light + dark from one token file. Touch targets ≥ 44pt.
- Small font app-wide: `T` (`src/components/ui.tsx`) draws every size × `TEXT_SCALE` (0.9). Write sizes at full scale; tight spacing (`Screen dense`) on the workout, food and shopping tabs.
- Neon look for the workout tab only (`neon` theme + `ThemeProvider` in `src/theme/index.ts`, design in `docs/mockups/workout-neon.html`), switched by `neonMode` in settings. Components read `t.neon` / `glow()` for borders and glows.

## Data
- `src/data/program.ts` — the 5-day program (edit here to change exercises). Sets and rest can be changed in the app's settings page (`/settings`, gear on the workout tab); `applyPlan` writes those onto `PROGRAM` in place so every screen reads the same plan
- `src/lib/settings.ts` — settings store (zustand), saved as JSON under storage meta key `settings`
- `src/lib/prayer.ts` (times, adhan, offline) + `src/lib/place.ts` (phone location, expo-location) — prayer times page `src/app/prayer.tsx` (`/prayer`), opened from a moon icon in the workout tab header, which shows only when prayer times are turned on in settings
- `src/lib/energy.ts` — calorie/macro calculator (`/calories`, from the side menu or settings); formulas and sources at the top of the file. Once it has your data, `targetsFor` makes its numbers the food tab's daily targets instead of the plan's `TARGETS`
- `src/components/SideMenu.tsx` — ☰ on the three tab headers: animated side menu with التقدم، الكالندر، مواقيت الصلاة (when on)، حساب السعرات، الإعدادات
- `src/lib/shop.ts` — splits the weekly shopping list into N trips (settings) with equal item counts; items are never split, few-day items go on the trip before they're eaten (`assignTrips`). The list itself is fixed; the trip chosen for any item (`shopMoves`) lives in settings and is edited from the shopping tab's edit button
- `src/data/nutrition.ts`, `src/data/shopping.ts` — generated from the nutrition plan / shopping list PDFs
- Food tab training vs rest day isn't the PDF's fixed weekdays (`WEEK_MENU.training` is unused): `isTrainingDay` in `src/lib/schedule.ts` — a day with a logged workout is training, a past day without one was rest, today counts as training unless switched to rest from the food tab (meta key `restDay`)
- `src/data/videos.ts` — one short YouTube form video per exercise ("فيديو" button on each exercise card opens `VideoSheet`, which plays it in-app); how they were picked is at the top of the file
- `src/data/verses.ts` — Quran verses for the launch popup (`src/components/VersePopup.tsx`). Tanzil Uthmani text copied verbatim from api.alquran.cloud; never retype or edit a verse by hand
- Source PDFs live in `docs/`
- `src/lib/gaps.ts` — gaps dashboard (`/gaps`) and calendar (`/attendance`) logic; thresholds and their sources are at the top of the file
- `src/lib/schedule.ts` — workout order: one continuous sequence through `PROGRAM`, not fixed weekdays. The workout tab opens on the one after your last session; missed and rest days don't move it. A program day's id is still `Day.weekday` (logged rows keep it), and plan weekdays only set the weekly attendance/volume target

## Commands
- `npx expo start` — run
- `npm test` — unit tests for pure logic (`src/lib/logic.ts`, `src/lib/gaps.ts`, `src/lib/shop.ts`, `src/lib/energy.ts`, `src/lib/schedule.ts`, `src/lib/prayer.ts`, settings, data integrity incl. videos)
- `npm run typecheck`
- `npx expo install <pkg>` — always, for SDK-compatible versions
