/**
 * Shown in the «خلصت التمرين» popup, a hadith and a fact by turns (`quoteFor` in src/lib/workoutFlow.ts).
 * Hadiths: well-known sound narrations with their source; check the wording against the source before editing.
 * Facts: plain, well-established findings (WHO physical activity guidelines and reviews on resistance training).
 */
export type Quote = { kind: 'hadith' | 'fact'; text: string; source: string };

export const HADITHS: Quote[] = [
  { kind: 'hadith', text: 'المؤمن القوي خير وأحب إلى الله من المؤمن الضعيف، وفي كلٍّ خير', source: 'رواه مسلم' },
  { kind: 'hadith', text: 'نعمتان مغبونٌ فيهما كثيرٌ من الناس: الصحة والفراغ', source: 'رواه البخاري' },
  { kind: 'hadith', text: 'إن لجسدك عليك حقًّا', source: 'رواه البخاري' },
  { kind: 'hadith', text: 'اغتنم خمسًا قبل خمس: شبابك قبل هرمك، وصحتك قبل سقمك، وغناك قبل فقرك، وفراغك قبل شغلك، وحياتك قبل موتك', source: 'رواه الحاكم، وصححه الألباني' },
  { kind: 'hadith', text: 'ما ملأ آدميٌّ وعاءً شرًّا من بطن، بحسب ابن آدم أكلاتٌ يقمن صلبه', source: 'رواه الترمذي' },
];

export const FACTS: Quote[] = [
  { kind: 'fact', text: 'العضلات بتقل مع السن من التلاتينات لو ما اتمرنتش. تمرين المقاومة بيحافظ عليها وعلى قوة عضمك', source: 'فايدة علمية' },
  { kind: 'fact', text: 'التمرين المنتظم بيقلل أعراض القلق والاكتئاب، ومزاجك بيتحسن بعد التمرين على طول', source: 'فايدة علمية' },
  { kind: 'fact', text: 'العضلة بتسحب السكر من الدم وبتحسن حساسية الإنسولين، فالتمرين بيقلل خطر السكر من النوع التاني', source: 'فايدة علمية' },
  { kind: 'fact', text: 'اللي بيتمرن بانتظام بينام أعمق وبيصحى مرتاح أكتر', source: 'فايدة علمية' },
  { kind: 'fact', text: 'التمرين بيزود الدم اللي رايح للمخ، وده بيساعد التركيز والذاكرة', source: 'فايدة علمية' },
  { kind: 'fact', text: 'العضلة بتكبر وانت مرتاح مش وانت بتتمرن. كُل بروتين كويس ونام كويس النهارده', source: 'فايدة علمية' },
];
