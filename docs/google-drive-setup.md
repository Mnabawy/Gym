# ربط Google Drive: إعداد مرة واحدة

محتاج تعمل ده مرة واحدة بس، عشان Google يعرف إن التطبيق بتاعك مسموحله يحفظ على Drive. حوالي 15 دقيقة.
الأسماء جوه Google Cloud بالإنجليزي، فكاتبها زي ما هتشوفها.

## 1. اعمل مشروع وفعّل Drive
1. افتح https://console.cloud.google.com وادخل بحسابك.
2. من فوق اختار القايمة جنب اسم المشروع ← **New Project** ← سمّيه `Gym` ← **Create**، واتأكد إنه هو المختار.
3. افتح https://console.cloud.google.com/apis/library/drive.googleapis.com ← **Enable**.

## 2. شاشة الموافقة
1. افتح https://console.cloud.google.com/auth/overview ← **Get started**.
2. App name: `Gym`، والإيميل بتاعك في الخانتين ← Audience: **External** ← كمّل لحد **Create**.
3. من **Data Access** ← **Add or remove scopes** ← دوّر على `drive.file` وعلّم عليه ← **Update** ← **Save**.
4. من **Audience**: دوس **Publish app** (عشان الربط ما يتلغيش كل أسبوع).
   لو مش عايز تنشره، ضيف إيميلك تحت **Test users** بدل كده.

## 3. بصمة التطبيق (SHA-1)
على الكمبيوتر في فولدر المشروع:
```bash
eas credentials -p android
```
اختار الـ profile اللي بتبني بيه (preview) ← **Keystore** ← انسخ قيمة **SHA1 Fingerprint**.

## 4. اعمل Android client
1. افتح https://console.cloud.google.com/auth/clients ← **Create client**.
2. Application type: **Android**.
3. Package name: `com.mnabawy.gym`
4. SHA-1: اللي نسخته في خطوة 3 ← **Create**.

مش محتاج تبعتلي أي حاجة: Google بيعرف التطبيق من اسمه والبصمة.

## 5. جرّب
اعمل build جديد ← الإعدادات ← **اربط Google Drive** ← اختار حسابك ← وافق.
هتلاقي ملف `Gym backup.json` على Drive بتاعك.

## لو ظهرت مشكلة
- **DEVELOPER_ERROR** أو **10**: البصمة أو اسم الباكدج غلط، أو بنيت بـ profile تاني ليه keystore مختلف. اعمل Android client تاني بالبصمة الصح.
- **"Google hasn't verified this app"**: دوس **Advanced** ← **Go to Gym**. ده عادي لتطبيق شخصي.
