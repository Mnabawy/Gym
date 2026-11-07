# إعداد المزامنة (مرة واحدة)

## 1. Google Cloud
https://console.cloud.google.com/auth/clients ← **Create client** مرتين:
- **Android**: Package `com.mnabawy.gym` + الـ SHA-1 (من `eas credentials -p android` ← Keystore). لو عملته قبل كده، سيبه.
- **Web application**: انسخ **Client ID** و **Client secret**.

## 2. Supabase
1. https://supabase.com ← **New project**.
2. **SQL Editor** ← الصق `supabase/schema.sql` ← **Run**.
3. **Authentication** ← **Providers** ← **Google** ← فعّله، حط الـ Client ID والـ secret (بتوع الـ Web)، علّم **Skip nonce checks** ← **Save**.
4. **Project Settings** ← **API**: انسخ **Project URL** و **anon key**.

## 3. التطبيق
في `eas.json` املا الـ `env` في كل profile:
```json
"EXPO_PUBLIC_SUPABASE_URL": "Project URL",
"EXPO_PUBLIC_SUPABASE_ANON_KEY": "anon key",
"EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "Web Client ID"
```
اعمل build جديد ← حسابك ← **المزامنة** لازم تقول «آخر مزامنة: النهارده».

## لو في مشكلة
- **DEVELOPER_ERROR / 10**: الـ SHA-1 أو اسم الباكدج غلط في الـ Android client.
- **Unacceptable audience**: الـ Web Client ID في التطبيق مش هو نفسه اللي في Supabase.
- **push_rows does not exist**: `schema.sql` ما اتشغلش.
