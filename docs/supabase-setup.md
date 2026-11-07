# المزامنة على Supabase: إعداد مرة واحدة

بعد الإعداد ده كل حاجة بتسجلها بتتحفظ على السيرفر بعد ثواني. لو مسحت التطبيق أو غيّرت الموبايل، تدخل بنفس حساب Google وكل حاجة ترجع لوحدها. الصور مش بتتزامن: بتفضل في ملف النسخة (الإعدادات ← احفظ نسخة، والنسخة التلقائية كل أسبوع).
حوالي 15 دقيقة، ومجاني.

## 1. Google Cloud (تسجيل الدخول بـ Google)
لو عملت ده قبل كده لـ Drive، المشروع والـ Android client موجودين: روح على خطوة 5 على طول.
1. افتح https://console.cloud.google.com ← **New Project** ← سمّيه `Gym` ← **Create**، واتأكد إنه هو المختار.
2. افتح https://console.cloud.google.com/auth/overview ← **Get started** ← App name: `Gym`، وإيميلك في الخانتين ← Audience: **External** ← **Create**.
3. من **Audience** دوس **Publish app** (أو ضيف إيميلك تحت **Test users**).
4. **Android client**: على الكمبيوتر في فولدر المشروع شغّل `eas credentials -p android` ← الـ profile اللي بتبني بيه ← **Keystore** ← انسخ **SHA1 Fingerprint**. بعدين https://console.cloud.google.com/auth/clients ← **Create client** ← **Android** ← Package name `com.mnabawy.gym` والـ SHA-1 ← **Create**.
5. **Web client**: نفس الصفحة ← **Create client** ← **Web application** ← اسمه `Gym web` ← **Create** ← انسخ **Client ID** و **Client secret**.

## 2. مشروع Supabase
1. افتح https://supabase.com وادخل بحساب GitHub أو Google ← **New project** ← سمّيه `gym` ← اختار كلمة سر للداتابيز وأقرب Region ← **Create**.
2. من الشمال: **SQL Editor** ← **New query** ← الصق محتوى الملف `supabase/schema.sql` كله ← **Run**. لازم يقول Success.
3. من الشمال: **Authentication** ← **Sign In / Providers** ← **Google** ← فعّله:
   - **Client IDs**: الـ Client ID من خطوة 1.
   - **Client Secret**: الـ secret من خطوة 1.
   - علّم على **Skip nonce checks**.
   - **Save**.
4. من **Project Settings** ← **API Keys** (أو **API**): انسخ **Project URL** والـ **anon / publishable key**.

## 3. حط القيم في التطبيق
في `eas.json` جوه `preview` و `production` في `env`:
```json
"EXPO_PUBLIC_SUPABASE_URL": "https://xxxx.supabase.co",
"EXPO_PUBLIC_SUPABASE_ANON_KEY": "...",
"EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "....apps.googleusercontent.com"
```
الـ anon key مش سر: السيرفر مش بيدّي أي حد غير بياناته هو (Row Level Security).
للتشغيل المحلي حط نفس الثلاثة في ملف `.env.local` في فولدر المشروع بصيغة `NAME=value`.

## 4. جرّب
اعمل build جديد وافتحه. لو كنت داخل بـ Google قبل كده، المزامنة بتشتغل لوحدها وبترفع كل بياناتك. افتح حسابك (القايمة الجانبية ← اسمك) ← **المزامنة** ← لازم تلاقي «آخر مزامنة: النهارده ...».
على Supabase: **Table Editor** ← `rows` هتلاقي بياناتك.

## إزاي بتشتغل
- كل تسجيل (مجموعة، وجبة، عادة، هدف، وزن...) صف لوحده. أحدث تعديل على كل صف هو اللي بيكسب، فمفيش نسخة كاملة بتمسح نسخة.
- بتتزامن بعد كل تغيير بـ 4 ثواني، ولما تفتح التطبيق، ولما ترجعله، ولما تخرج منه. من غير نت، التغييرات بتستنى وتتبعت أول ما النت يرجع.
- أول مرة على موبايل: بيجيب كل اللي على السيرفر، ولو نفس الحاجة على الاتنين السيرفر بيكسب، واللي على الموبايل بس بيطلع.
- «اخرج وامسح بياناتي» ما بيمسحش غير لما كل التغييرات توصل السيرفر.
- المشروع المجاني بيقف لو ما اتستخدمش أسبوع؛ ترجّعه من لوحة Supabase بضغطة.

## لو ظهرت مشكلة
- **DEVELOPER_ERROR** أو **10** وانت بتدخل: البصمة أو اسم الباكدج غلط في الـ Android client، أو بنيت بـ profile تاني ليه keystore مختلف.
- «آخر مزامنة ما نفعتش» وانت داخل: اتأكد إن `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` هو الـ Web client (مش الـ Android)، وإنه نفسه في Client IDs في Supabase.
- **Unacceptable audience in id_token**: الـ Client ID في Supabase مختلف عن اللي في التطبيق.
- **function push_rows does not exist**: ملف `schema.sql` ما اتشغلش.
