// One short YouTube video per exercise showing correct form (button next to the exercise name).
// Picked 2026-11-04: for "<exercise> proper form" and "how to <exercise>" (filter: under 4 minutes), the most-viewed
// result that teaches that exact exercise. Non-lessons were skipped even with more views (e.g. a 260 kg deadlift record).
// `views` is the count at pick time. Ids were checked against YouTube's oEmbed endpoint.

export type FormVideo = { id: string; short: boolean; title: string; channel: string; views: number };

export const FORM_VIDEOS: Record<string, FormVideo> = {
  "deadlift": { id: "HrXR9MxcU8g", short: true, title: "How to Deadlift 🔥 Save your spine!", channel: "Davis Diley", views: 18000000 },
  "lat-pulldown": { id: "bNmvKpJSWKM", short: true, title: "✅ The PERFECT Lat Pulldown (DO THIS!)", channel: "Andrew Kwong (DeltaBolic)", views: 15000000 },
  "barbell-row": { id: "Nqh7q3zDCoQ", short: true, title: "The PERFECT Barbell Row (5 Steps)", channel: "Jeremy Ethier Shorts", views: 7300000 },
  "chest-supported-row": { id: "czoQ_ncuqqI", short: true, title: "Setting Up for Chest Supported Dumbbell Rows in 10 Seconds ✅", channel: "Aakash Wadhwani", views: 4300000 },
  "straight-arm-pulldown": { id: "hAMcfubonDc", short: true, title: "The Perfect Straight Arm Pulldown", channel: "Andrew Kwong (DeltaBolic)", views: 4400000 },
  "db-lateral-raise": { id: "Kl3LEzQ5Zqs", short: true, title: "The Perfect Lateral Raise (DO THIS!)", channel: "Andrew Kwong (DeltaBolic)", views: 18000000 },
  "barbell-bench-press": { id: "_FkbD0FhgVE", short: true, title: "Perfect Bench Press Form (DO THIS!)", channel: "Andrew Kwong (DeltaBolic)", views: 59000000 },
  "incline-db-press": { id: "8fXfwG4ftaQ", short: true, title: "The PERFECT Incline Dumbbell Chest Press", channel: "Andrew Kwong (DeltaBolic)", views: 12000000 },
  "low-to-high-cable-fly": { id: "M1N804yWA-8", short: false, title: "How To: Low Cable Chest Fly", channel: "ScottHermanFitness", views: 2104638 },
  "ez-bar-curl": { id: "KFinlAT6aEo", short: true, title: "Know The Difference: EZ Bar Curls ⚠️ #curls", channel: "Hazzytrainer", views: 3800000 },
  "preacher-curl": { id: "Mv-KfOHYnGg", short: true, title: "If you Avoid Doing this on Preacher Curl There is No Point", channel: "TylerPath", views: 3600000 },
  "hammer-curl": { id: "zC3nLlEvin4", short: false, title: "How To: Dumbbell Hammer Curl", channel: "ScottHermanFitness", views: 12773723 },
  "romanian-deadlift": { id: "5rIqP63yWFg", short: true, title: "RDL Tutorial: 3 Simple Steps", channel: "Davis Diley", views: 11000000 },
  "seated-leg-curl": { id: "xdbEG3xGLI8", short: true, title: "✅ The PERFECT Seated Leg Curl Tips", channel: "Andrew Kwong (DeltaBolic)", views: 7300000 },
  "bulgarian-split-squat": { id: "hlHJKu0XX4c", short: true, title: "Bulgarian split squat TIPS 🍑 #gluteday #glutesworkout #gluteday #bulgariansplitsquats #legday", channel: "WORKOUT WITH GINA", views: 10000000 },
  "barbell-hip-thrust": { id: "SEdqd1n0cvg", short: false, title: "How To: Hip Thrust", channel: "ScottHermanFitness", views: 5363433 },
  "seated-calf-raise": { id: "JbyjNymZOt0", short: false, title: "How to Do Seated Calf Raises", channel: "LIVESTRONG", views: 1520865 },
  "seated-db-shoulder-press": { id: "k6tzKisR3NY", short: true, title: "The PERFECT Dumbbell Shoulder Press (DO THIS!)", channel: "Andrew Kwong (DeltaBolic)", views: 23000000 },
  "cable-lateral-raise": { id: "KVauca12MF4", short: true, title: "Do This Instead of Leaning Cable Lateral Raises", channel: "TylerPath", views: 8900000 },
  "reverse-pec-deck": { id: "7tgx6QHB0-A", short: true, title: "❌ Rear Delt Machine Flyes Mistakes (FIX THESE!)", channel: "Andrew Kwong (DeltaBolic)", views: 7400000 },
  "weighted-dips": { id: "ci5tcFgIntI", short: true, title: "Fix your dips 👉🏼 SAVE YOUR SHOULDERS!", channel: "Davis Diley", views: 4700000 },
  "overhead-triceps-extension": { id: "b_r_LW4HEcM", short: true, title: "✅ The PERFECT Overhead DB Tricep Extension", channel: "Andrew Kwong (DeltaBolic)", views: 14000000 },
  "rope-pushdown": { id: "Rc7-euA8FDI", short: true, title: "STOP DOING These Tricep Pushdown Mistakes!", channel: "Andrew Kwong (DeltaBolic)", views: 7400000 },
  "barbell-back-squat": { id: "MLoZuAkIyZI", short: true, title: "Best Squat Tutorial Ever Made", channel: "Davis Diley", views: 10000000 },
  "leg-press": { id: "EotSw18oR9w", short: true, title: "✅ The PERFECT Leg Press", channel: "Andrew Kwong (DeltaBolic)", views: 9800000 },
  "leg-extension": { id: "ztNBgrGy6FQ", short: true, title: "A Better Way To Do Leg Extensions", channel: "Jeff Nippard", views: 10000000 },
  "standing-calf-raise": { id: "-M4-G8p8fmc", short: false, title: "How to Do a Calf Raise | Sexy Legs Workout", channel: "Howcast", views: 3543499 },
};

/** Player inside the app: autoplay, inline on iPhone, no unrelated videos at the end. */
export const embedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;

/** "59 مليون", "563 ألف". */
export function viewsAr(n: number): string {
  if (n >= 1e6) return `${Math.round(n / 1e5) / 10} مليون`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} ألف`;
  return String(n);
}

/** Shorts open in the Shorts player; longer videos in the normal one. */
export const videoUrl = (v: FormVideo) => (v.short ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`);
