# Gym App: Claude Code Prompts

Use these in order, one prompt per step. Run the app and check it before moving to the next step.
Before you start, put `Workout-Program-CBum.pdf`, `نظام-الأكل.pdf` and `قايمة-المشتريات.pdf` in a `docs/` folder at the project root.

---

## 0. CLAUDE.md (create this file first, at the project root)

```md
# Gym App

Personal workout + nutrition app for one user (me). Arabic UI, RTL, Egyptian dialect copy.
Exercise names stay in English (gym vocabulary).

## Stack
- Expo (latest stable SDK), TypeScript strict, expo-router (file-based tabs)
- State: zustand. Persistence: expo-sqlite (workout logs), AsyncStorage only for small settings
- expo-haptics, expo-keep-awake, expo-notifications (rest timer when app is backgrounded)
- Fonts: Readex Pro (Arabic) + Inter (numbers/Latin) via expo-font
- No backend. Everything offline-first on device.

## Design rules
- RTL everywhere (I18nManager.forceRTL). Numbers use Inter with tabular figures.
- Each muscle has one fixed color (Okabe–Ito, colorblind-safe):
  chest #0072B2, shoulders #56B4E9, triceps #CC79A7, back #D55E00,
  biceps #E69F00, quads #009E73, hams/glutes #C9B200, calves #7A8290
- Technique tags as Arabic word badges: تقيل (filled dark), فشل (outlined), دروب (dashed outline)
- Light + dark theme from one token file. Big touch targets (min 44pt) — used mid-workout with sweaty hands.

## Source material
- docs/Workout-Program-CBum.pdf — the program and rules
- docs/نظام-الأكل.pdf — targets, weekly menu, swaps, supplements
- docs/قايمة-المشتريات.pdf — weekly shopping list

## Conventions
- Keep program/menu data in typed JSON-like TS files under src/data — never hardcode inside screens.
- Small components, one responsibility each. Write unit tests for pure logic (progression, timer, date/session rollover).
```

---

## 1. Project setup

```
Read CLAUDE.md. Create a new Expo app with TypeScript and expo-router in this folder.
Set up: RTL forced on, Readex Pro + Inter fonts loaded, a theme token file (light + dark)
with the muscle colors from CLAUDE.md, and 4 bottom tabs:
"التمرين" (today), "التقدم" (progress), "الأكل" (nutrition), "المشتريات" (shopping).
Each tab shows a placeholder title for now. Make sure it runs on iOS and Android with `npx expo start`.
```

## 2. Program data

```
Read docs/Workout-Program-CBum.pdf and create src/data/program.ts with typed data:
Day { weekday (0=Sun..6=Sat), titleAr, exercises: Exercise[] }
Exercise { id, name, muscle, sets, repLow, repHigh, tag: 'heavy'|'fail'|'drop'|null, perLeg?: boolean, restSec }
restSec = 150 for heavy, 90 for everything else. Training days: Mon, Tue, Wed, Fri, Sat. Sun + Thu are rest.
Also create src/data/rules.ts with the Arabic explanations of تقيل / فشل / دروب and the 6 training rules from page 2.
Add a unit test that checks every day's exercises and total sets match the PDF.
```

## 3. Today screen

```
Build the "التمرين" tab:
- Top: 7 day chips (Sun..Sat, Arabic names), each with a thin color bar of that day's muscles. Opens on today's weekday.
- Header: day title + "x / y مجموعة" progress bar.
- One card per exercise: right border in the muscle color, number, English name, muscle dot + Arabic muscle name,
  "sets × repLow–repHigh", tag badge, rest time.
- Under the header of 'fail' exercises show "آخر مجموعة: كمّل لحد الفشل"; for 'drop' show the drop-set note.
- Rest days show a simple "يوم راحة" card.
Use static data only in this step (no saving yet).
```

## 4. Set logging + storage

```
Add set logging with expo-sqlite:
- Tables: sessions(id, date, weekday), set_logs(id, session_id, exercise_id, set_index, kg, reps, done, created_at).
- Each set row: kg input, reps input (numeric keypads), and a big ✓ button.
- Placeholders show what I did last time for the same exercise and set. Tapping ✓ with empty inputs copies the placeholder values.
- A session belongs to a calendar date; logging again on a new date starts a new session automatically.
- Progression hint: if in the last session ALL sets reached repHigh with kg > 0,
  show a green banner "زوّد الوزن 2.5 كجم ↑" on that exercise.
- Add a "امسح تسجيل النهارده" action with an in-app confirm (no native alert).
Write unit tests for: session rollover by date, placeholder lookup, and the progression rule.
```

## 5. Rest timer

```
Add an automatic rest timer:
- Starts when I tap ✓ on a set, using that exercise's restSec.
- Sticky bottom bar: countdown (mm:ss), "+30 ث" and "خلاص" buttons. After zero it counts up in green with "يلا المجموعة الجاية".
- Haptic + sound at zero. Keep the screen awake while a timer runs (expo-keep-awake).
- If the app goes to background, schedule a local notification for when rest ends (expo-notifications); cancel it if I come back or skip.
- Timer state must survive switching tabs.
Base the countdown on an end timestamp, not on setInterval ticks, so it stays correct after backgrounding.
```

## 6. Progress tab

```
Build the "التقدم" tab:
- List of exercises grouped by day; tap one to see a line chart of the best set (kg × reps → estimated 1RM with the Epley formula)
  per session, plus a table of past sessions.
- Weekly summary card: sessions done this week, total hard sets per muscle vs the 10-set target (colored bars per muscle).
- Use react-native-svg (or victory-native) for the chart; numbers in Inter tabular.
Add a unit test for the Epley calculation and weekly set counting.
```

## 7. Nutrition tab

```
Read docs/نظام-الأكل.pdf and create src/data/nutrition.ts:
targets (kcal, protein, carbs, fat), the 7-day menu (each day → 5 meals → items with grams + macros),
the swap table (protein / carbs / fat groups) and supplements.
Build the "الأكل" tab:
- Top: daily targets as 4 colored tiles (kcal dark, protein blue, carbs orange, fat green).
- Day chips (Sat..Fri), opening on today. Each meal is a card with food chips colored by type
  (protein blue, carbs orange, fat green, veg grey) and its macros.
- A checkbox per meal ("أكلتها") with a daily progress bar of kcal and protein eaten. Store checks in sqlite by date.
- A "البدائل" bottom sheet showing the swap table.
```

## 8. Shopping tab

```
Read docs/قايمة-المشتريات.pdf and create src/data/shopping.ts.
Build the "المشتريات" tab as a checklist grouped by category with colored headers:
item, exact weekly amount, what to buy, and which days it's eaten.
Checks persist per week (reset automatically each Friday) and there's a "ابدأ أسبوع جديد" button.
Add a "انسخ القايمة" button that copies the list as plain text (for notes apps).
```

## 9. Polish + build

```
Review the whole app:
- Check every screen in light and dark mode and at small phone width; fix overflow and RTL issues.
- Make sure all touch targets are ≥ 44pt and inputs don't hide behind the keyboard.
- Add an app icon and splash in the app's colors.
- Run all tests and fix failures.
Then set up EAS: eas.json with a "preview" profile (Android APK, iOS internal) and tell me the exact commands to build and install on my phone.
```

---

## Tips
- After each step, run the app and tell Claude Code exactly what's wrong ("the timer stops when I lock the phone") instead of asking for a rewrite.
- If a step gets big, add: "Plan first, show me the plan, then implement."
- To change the program later, edit only `src/data/program.ts`.
