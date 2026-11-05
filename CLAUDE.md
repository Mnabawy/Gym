# Gym App

Personal workout + nutrition app for one user. Arabic UI, RTL, Egyptian dialect copy.
Exercise names stay in English (gym vocabulary).

## Stack
- Expo SDK 58, TypeScript strict, expo-router (routes in `src/app/`, tabs in `src/app/(tabs)/`)
- State: zustand (`src/lib/timer.ts`, `src/lib/bus.ts`)
- Storage: expo-sqlite on iOS/Android (`src/lib/storage.ts`), localStorage on web (`src/lib/storage.web.ts`), same `Storage` interface
- expo-haptics, expo-keep-awake, expo-notifications (rest timer when backgrounded + workout reminder), expo-clipboard, expo-file-system + expo-sharing + expo-document-picker (backup file), expo-image-picker + expo-image-manipulator (progress photos), expo-location (prayer times), react-native-webview (form videos play in-app; `YouTubePlayer.web.tsx` is a plain iframe)
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
- `src/data/program.ts` — the 5-day program from the PDF (`PDF_PROGRAM`). The exercises can be edited in the app (`/program`, from settings: add, delete, reorder, rename, reps, technique, replace; `src/lib/programEdit.ts`, meta `program`); `applyProgram` puts that edit into `PROGRAM` / `ALL_EXERCISES` / `DEFAULT_SETS` in place, then `applyPlan` writes the settings' sets overrides and rest, so every screen reads the same plan. The five program days themselves are fixed (their ids are stored with logged sets). Renaming keeps an exercise's id (and history); replacing makes a new id
- `src/lib/settings.ts` — settings store (zustand), saved as JSON under storage meta key `settings`
- `src/lib/prayer.ts` (times, adhan, offline) + `src/lib/place.ts` (phone location, expo-location) — prayer times page `src/app/prayer.tsx` (`/prayer`), opened from a moon icon in the workout tab header, which shows only when prayer times are turned on in settings
- `src/lib/energy.ts` — calorie/macro calculator (`/calories`, from the side menu or settings); formulas and sources at the top of the file. Once it has your data, `targetsFor` makes its numbers the food tab's daily targets instead of the plan's `TARGETS`
- `src/components/SideMenu.tsx` — ☰ on the three tab headers: animated side menu with التقدم، تقرير الأسبوع، وزنك والقياسات، الكالندر، مواقيت الصلاة (when on)، حساب السعرات، الإعدادات
- `src/lib/shop.ts` — splits the weekly shopping list into N trips (settings) with equal item counts; items are never split, few-day items go on the trip before they're eaten (`assignTrips`). The list itself is fixed; the trip chosen for any item (`shopMoves`) lives in settings and is edited from the shopping tab's edit button
- `src/data/nutrition.ts`, `src/data/shopping.ts` — generated from the nutrition plan / shopping list PDFs
- Food tab training vs rest day isn't the PDF's fixed weekdays (`WEEK_MENU.training` is unused): `isTrainingDay` in `src/lib/schedule.ts` — a day with a logged workout is training, a past day without one was rest, today counts as training unless switched to rest from the food tab (meta key `restDay`)
- `src/data/videos.ts` — one short YouTube form video per exercise ("فيديو" button on each exercise card opens `VideoSheet`, which plays it in-app); how they were picked is at the top of the file
- `src/data/verses.ts` — Quran verses for the launch popup (`src/components/VersePopup.tsx`). Tanzil Uthmani text copied verbatim from api.alquran.cloud; never retype or edit a verse by hand
- Source PDFs live in `docs/`
- `src/lib/backup.ts` (format, parsing) + `src/lib/backupIO.ts` / `.web.ts` (share sheet, file picker, clipboard) — backup and restore of everything (`Storage.dump` / `restore`), from the settings page. Meta `lastBackup`; the end-of-workout card nudges after 7 days
- `src/lib/weight.ts` — body weight log (`/weight`, side menu وزنك), meta `weights`; weekly rate vs the goal. Logging a weight also sets the calculator's weight
- `src/lib/journal.ts` (pure) + `src/lib/meta.ts` (read/write) — JSON maps in meta: `swaps` (exercise swapped for today, `date|exId` → name; sets stay on the program exercise, records/prefill/progress chart only compare the same variant, `toSessions` gets the swapped set), `notes` (per exercise), `water` (ml per day), `mealPicks` (meal option per `date|meal`); food history for the food tab
- `src/data/alternatives.ts` — swap alternatives per exercise
- `src/lib/plates.ts` — plate calculator (which exercises use a bar, bar weight `barKg` in settings)
- `src/lib/summary.ts` — end-of-workout summary card (volume, change from last time, records, session length from set tick times)
- Set rows also store `rir` (reps left, asked after each tick when `askRir` is on; `increaseTip` in logic.ts suggests more weight at RIR 3+) and `at` (tick time, ms; null for past days). SQLite columns are added with ALTER TABLE on start
- Workout tab can log or fix a past day (calendar button, last 14 days): sets go to that date, the rest timer stays off. Food tab can tick meals, water and supplements for earlier days of the week
- `src/lib/report.ts` — weekly report (`/week`, side menu; a card on the workout tab on Fridays)
- `src/lib/plates.ts` also has `warmups` (warm-up ramp for heavy-tagged exercises, "إحماء" on the exercise card)
- `src/lib/weight.ts` also has body measurements (meta `measures`); `src/lib/photos.ts` (expo-image-picker, shrunk with expo-image-manipulator, files in the app's document folder; in the backup file as base64 — "احفظ نسخة" and the automatic copy in your folder, not the clipboard copy or the in-app auto copies; restore adds missing ones; web stub) — both on `/weight`
- `src/lib/journal.ts` also has food outside the plan (meta `extras`) and supplements ticked (meta `supps`)
- `src/lib/drive.ts` (sign-in with @react-native-google-signin/google-signin, scope drive.file, no config plugin needed on Android; web stub) + `src/lib/driveApi.ts` (pure REST calls, tested) — backup to Google Drive: one file "Gym backup.json" updated in place, at most daily when the data changed, from the root layout; settings → Google Drive. Setup steps for the owner: `docs/google-drive-setup.md`. Restore keeps the phone's own drive* meta keys
- `src/lib/autoBackup.ts` — weekly automatic backup (last 4 inside the app, plus a folder you pick with `Directory.pickDirectoryAsync`, settings `autoBackup` / `backupDir`); runs from the root layout
- `src/lib/reminder.ts` — workout reminder notifications (settings `reminder*`), next week scheduled ahead (`reminderTimes` in schedule.ts), re-synced from the root layout
- `src/lib/gaps.ts` — gaps dashboard (`/gaps`) and calendar (`/attendance`) logic; thresholds and their sources are at the top of the file
- `src/lib/schedule.ts` — workout order: one continuous sequence through `PROGRAM`, not fixed weekdays. The workout tab opens on the one after your last session; missed and rest days don't move it. A program day's id is still `Day.weekday` (logged rows keep it), and plan weekdays only set the weekly attendance/volume target

## Commands
- `npx expo start` — run
- `npm test` — unit tests for pure logic (`src/lib/logic.ts`, `src/lib/gaps.ts`, `src/lib/shop.ts`, `src/lib/energy.ts`, `src/lib/schedule.ts`, `src/lib/prayer.ts`, backup, weight, journal, plates, summary, report, programEdit, settings, data integrity incl. videos and alternatives)
- `npm run typecheck`
- `npx expo install <pkg>` — always, for SDK-compatible versions

## Git
- Work, commit and push directly on `main`. No feature branches (the owner asked for this).
