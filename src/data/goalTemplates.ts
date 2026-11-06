// Ready-made roads for a new goal (الأهداف → هدف جديد). Each one is a suggestion: every stage and task can be
// renamed, deleted or added to on the goal's page.
// The money road follows the usual personal-finance order: know your numbers → a safety net and no costly debt →
// raise your income → save automatically → invest steadily for the long run. General guidance, not financial advice.
import { goalId, type Goal, type Stage } from '../lib/goals';

export type GoalTemplate = {
  key: string;
  label: string;
  sub: string;
  icon: string;
  color: string;
  name: string;
  unit: string;
  target: number;
  why: string;
  stages: { title: string; note?: string; tasks: string[] }[];
};

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    key: 'money',
    label: 'فلوس',
    sub: 'مثلًا توصل لـ $100,000',
    icon: 'cash',
    color: '#009E73',
    name: 'أوصل لـ 100 ألف دولار',
    unit: '$',
    target: 100000,
    why: '',
    stages: [
      {
        title: 'اعرف نقطة البداية',
        note: 'مش هتعرف توصل لو مش عارف انت فين',
        tasks: ['احسب اللي معاك دلوقتي (فلوس + اللي ليك − اللي عليك)', 'سجّل دخلك ومصاريفك شهر كامل', 'اعمل ميزانية: أساسيات / رغبات / تحويش', 'اكتب ليه عايز توصل للرقم ده'],
      },
      {
        title: 'الأمان',
        note: 'شبكة أمان قبل أي مخاطرة',
        tasks: ['اقفل أي دين بفايدة عالية', 'حساب منفصل للتحويش', 'صندوق طوارئ: مصاريف 3 شهور', 'كمّله لـ 6 شهور'],
      },
      {
        title: 'زوّد دخلك',
        note: 'التحويش له حد، الدخل ملوش',
        tasks: ['اختار مهارة واحدة عليها طلب وبتدفع كويس', 'اتعلمها لحد ما تقدر تشتغل بيها', 'اعمل 3 شغلانات تعرضها (بورتفوليو)', 'أول دخل إضافي', 'أول عميل يرجعلك تاني', 'ارفع سعرك'],
      },
      {
        title: 'حوّش أوتوماتيك',
        tasks: ['حوّل 20% من أي دخل أول ما يوصل', 'زوّد النسبة مع كل زيادة في الدخل', 'راجع المصاريف أول كل شهر'],
      },
      {
        title: 'استثمر',
        note: 'على المدى الطويل، ومتحطش فلوس هتحتاجها قريب',
        tasks: ['اتعلم أساسيات الاستثمار والمخاطرة', 'وزّع (صناديق، ذهب، …) بدل ما تحط كله في حاجة واحدة', 'مبلغ ثابت كل شهر', 'متبيعش وقت الهبوط: راجع مرة كل 3 شهور بس'],
      },
      {
        title: 'كبّر',
        tasks: ['مصدر دخل تاني (مشروع جانبي أو منتج)', 'راجع الخطة كل 3 شهور وعدّلها', 'وصّلت للهدف 🎉'],
      },
    ],
  },
  {
    key: 'skill',
    label: 'مهارة أو علم',
    sub: 'ساعات تعلّم لحد ما تتقنها',
    icon: 'school',
    color: '#0072B2',
    name: 'أتقن مهارة جديدة',
    unit: 'ساعة',
    target: 300,
    why: '',
    stages: [
      { title: 'حدّد', tasks: ['اكتب المهارة بالظبط والمستوى اللي عايزه', 'اختار مصدر رئيسي واحد (كورس أو كتاب)', 'حدد وقت ثابت في اليوم'] },
      { title: 'الأساسيات', tasks: ['خلّص الجزء الأول من المصدر', 'لخّص اللي اتعلمته بإيدك', 'اعمل أول تمرين عملي'] },
      { title: 'تطبيق', tasks: ['مشروع صغير من أوله لآخره', 'اعرضه على حد يفهم وخد رأيه', 'صلّح نقط الضعف'] },
      { title: 'إتقان', tasks: ['مشروع حقيقي لحد غيرك', 'علّم حد اللي اتعلمته', 'وصّلت للمستوى 🎉'] },
    ],
  },
  {
    key: 'blank',
    label: 'أي هدف تاني',
    sub: 'تكتب طريقك بنفسك',
    icon: 'flag',
    color: '#E69F00',
    name: '',
    unit: '',
    target: 100,
    why: '',
    stages: [{ title: 'أول خطوة', tasks: ['اكتب أول حاجة صغيرة هتعملها'] }],
  },
];

/** A new goal from a template, starting today. */
export function fromTemplate(tp: GoalTemplate, today: string, now: number = Date.now()): Goal {
  let n = 0;
  const id = () => goalId(now, ++n);
  const stages: Stage[] = tp.stages.map((s) => ({ id: id(), title: s.title, ...(s.note ? { note: s.note } : {}), tasks: s.tasks.map((t) => ({ id: id(), title: t, done: null })) }));
  return { id: goalId(now), name: tp.name, icon: tp.icon, color: tp.color, unit: tp.unit, start: 0, target: tp.target, startDate: today, due: null, why: tp.why, stages, entries: [], wins: [], reviews: [] };
}
