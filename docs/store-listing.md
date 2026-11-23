# GymApp: Google Play listing (draft)

Prepared Nov 2026. Nothing here is live: there's no Play developer account or billing hooked up yet.

## App name
- Arabic: **جيم آب: برنامجك وأوزانك**
- English: **GymApp: Workout Plan & Progress**

## Short description (80 characters max)
- AR: برنامج جيم على مستواك، والأوزان بتزيد لوحدها كل تمرين.
- EN: A gym plan for your level, with the weights going up for you every session.

## Full description (Arabic, main market)
بتروح الجيم ومش عارف تشيل كام؟ أوزانك واقفة من شهور؟

جيم آب بيعملك برنامج على هدفك ومستواك وأيام تمرينك، وبعد كل تمرين بيقولك تشيل كام المرة الجاية بالظبط.

• برنامج في دقيقة: عضل، قوة، أو تنشيف · مبتدئ أو متوسط · من 3 لـ 5 أيام
• زيادة الأوزان تلقائي: تكرار زيادة لحد آخر المدى، وبعدها وزن زيادة
• كشف الثبات: لو تمرين وقف، التطبيق يقولك السبب (تعب، غياب، أكل، نزول وزن) وتعمل إيه
• فيديو لكل تمرين يوريك الطريقة الصح
• عداد راحة، حاسبة طارات، إحماء، وأسبوع خفيف لما جسمك يحتاج
• الأكل والمياه والمكملات وقايمة المشتريات
• وزنك ومقاساتك وصور التقدم
• شغال من غير إنترنت، وبياناتك على موبايلك
• مع كوتش (اختياري): يتابع ملخص تمرينك ويبعتلك برامج

## Full description (English)
Not sure how much to lift? Stuck on the same weights for months?

GymApp builds a plan from your goal, level and training days, then tells you exactly what to lift next session.

- A plan in a minute: muscle, strength or fat loss · beginner or intermediate · 3 to 5 days
- Auto progression: add reps to the top of the range, then add weight
- Plateau detector: when a lift stalls, see why (fatigue, missed sessions, food, fast weight loss) and what to do
- A form video for every exercise
- Rest timer, plate calculator, warm-ups, and a light week when you need one
- Food, water, supplements and a shopping list
- Body weight, measurements and progress photos
- Works offline; your data stays on your phone
- Optional coach: they see your summary and send you plans

## Pricing (draft)
- Free: logging, generated plan, auto progression, food, shopping, backups on the phone.
- Pro, 149 EGP / month (or 1,199 EGP / year): coach, online copy, plateau detector, new plans when one ends.
- Coaches: free account; they get paid by their clients directly at first. Later: per-client pricing.
- The paywall page is `src/app/premium.tsx`. Nothing is locked until billing (Google Play Billing) is connected.

## Category and tags
- Category: Health & Fitness
- Tags: workout tracker, gym, strength training, bodybuilding, Arabic

## Screenshots to take (phone, Arabic UI, light mode)
1. Setup: goal / level / days, with the plan preview
2. Workout tab with the progression chip (`+2.5 ↑`) and its explanation
3. Plateau card with its reason
4. Form video playing
5. Progress page (strength chart)
6. Food tab
7. Coach dashboard

## Data safety form (answers for today's build)
- Data collected only with an account: email address (account), fitness info and body weight (the copy and the coach summary). Not shared with third parties; stored on Supabase (EU).
- Without an account: no data leaves the phone.
- Encrypted in transit: yes (HTTPS). Users can delete their data: sign-out keeps phone data; deleting the account needs a "delete account" button (TODO before launch, required by Play).

## Before launch (not done)
- Google Play developer account, app signing, release build through EAS.
- A "delete my account" option (Play policy) and a privacy policy page.
- Google Play Billing for Pro.
- Validate with ~10 gym-goers first (see the plan in the conversation of Nov 2026).
