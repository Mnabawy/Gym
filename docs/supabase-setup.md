# المزامنة على Supabase: إعداد مرة واحدة

بعد الإعداد ده كل حاجة بتسجلها بتتحفظ على السيرفر بعد ثواني. لو مسحت التطبيق أو غيّرت الموبايل، تدخل بنفس حساب Google وكل حاجة ترجع لوحدها. الصور مش بتتزامن (بتفضل في نسخة Drive والملف).
حوالي 15 دقيقة، ومجاني.

## 1. Web client في Google Cloud
في نفس مشروع Google Cloud بتاع Drive (docs/google-drive-setup.md):
1. افتح https://console.cloud.google.com/auth/clients ← **Create client**.
2. Application type: **Web application** ← اسمه `Gym web` ← **Create**.
3. انسخ **Client ID** و **Client secret** وخليهم معاك.

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
- «آخر مزامنة ما نفعتش» وانت داخل: اتأكد إن `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` هو الـ Web client (مش الـ Android)، وإنه نفسه في Client IDs في Supabase.
- **Unacceptable audience in id_token**: الـ Client ID في Supabase مختلف عن اللي في التطبيق.
- **function push_rows does not exist**: ملف `schema.sql` ما اتشغلش.
