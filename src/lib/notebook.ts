// دفتر الأفكار (the owner's ask, Nov 2026): every idea with all its details, so it doesn't have to be a task or a goal
// the moment it's written. An idea has a title, a type (مشروع، شغل، تطبيق، فسحة، تانية; a فسحة also has a plan kind for
// يومي), its details (text and «• » points, src/lib/notes.ts), why, a first step, a link, a rough cost, and a status
// (لسه فكرة → بدرسها → اتنفّذت / اتلغت). «حوّلها لهدف / لمهمة» carries the details over (`toGoal` / `toTask`) and links
// back. Meta `notebook`, a list synced one row per idea (SPLIT_META). Brain dump «فكرة» lines and يومي's ideas for plans
// land here too. Pure helpers; the store is src/lib/notebookStore.ts.
import { goalId, type Goal } from './goals';
import { isRec, keepExtra, parseList } from './records';
import { isPlanKind, type PlanKindKey, type Task } from './tasks';

export const NOTEBOOK_KEY = 'notebook';

export const IDEA_TYPES = {
  project: { label: 'مشروع', icon: 'rocket-outline', color: '#AF52DE' },
  work: { label: 'شغل', icon: 'briefcase-outline', color: '#0A84FF' },
  app: { label: 'تطبيق', icon: 'phone-portrait-outline', color: '#30B0C7' },
  fun: { label: 'فسحة', icon: 'sunny-outline', color: '#FF9F0A' },
  other: { label: 'تانية', icon: 'bulb-outline', color: '#8E8E93' },
} as const;
export type IdeaType = keyof typeof IDEA_TYPES;

export const IDEA_STATUS = { idea: 'لسه فكرة', study: 'بدرسها', done: 'اتنفّذت', dropped: 'اتلغت' } as const;
export type IdeaStatus = keyof typeof IDEA_STATUS;

export type NoteIdea = {
  id: string;
  title: string;
  type: IdeaType;
  /** For a فسحة: the plan kind it becomes on يومي (خروجة by default). */
  kind?: PlanKindKey;
  note: string;
  why: string;
  first: string;
  link: string;
  cost: string;
  status: IdeaStatus;
  /** The day it was written down. */
  created: string;
  /** Last change, ms (the list puts the latest first). */
  updated: number;
  /** What it became: a goal's or a task's id. */
  goal?: string;
  task?: string;
};

const FIELDS = new Set(['id', 'title', 'type', 'kind', 'note', 'why', 'first', 'link', 'cost', 'status', 'created', 'updated', 'goal', 'task']);
const s = (v: unknown) => (typeof v === 'string' ? v : '');

export function parseIdea(x: unknown): NoteIdea | null {
  if (!isRec(x) || typeof x.id !== 'string' || !s(x.title).trim()) return null;
  const type = (s(x.type) in IDEA_TYPES ? x.type : 'other') as IdeaType;
  const status = (s(x.status) in IDEA_STATUS ? x.status : 'idea') as IdeaStatus;
  return keepExtra<NoteIdea>(x, FIELDS, {
    id: x.id,
    title: s(x.title).trim(),
    type,
    ...(isPlanKind(x.kind) ? { kind: x.kind } : {}),
    note: s(x.note),
    why: s(x.why),
    first: s(x.first),
    link: s(x.link),
    cost: s(x.cost),
    status,
    created: /^\d{4}-\d{2}-\d{2}$/.test(s(x.created)) ? s(x.created) : '2026-01-01',
    updated: typeof x.updated === 'number' ? x.updated : 0,
    ...(s(x.goal) ? { goal: s(x.goal) } : {}),
    ...(s(x.task) ? { task: s(x.task) } : {}),
  });
}

export const parseNotebook = (raw: string | null | undefined) => parseList(raw, parseIdea);

export const noteIdeaId = (now: number = Date.now(), n = 0) => `n${now.toString(36)}${n ? `-${n}` : ''}`;

export function newIdea(title: string, today: string, now: number, extra: Partial<NoteIdea> = {}): NoteIdea {
  return { id: noteIdeaId(now), title: title.trim(), type: 'other', note: '', why: '', first: '', link: '', cost: '', status: 'idea', created: today, updated: now, ...extra };
}

/** Open ideas (لسه فكرة / بدرسها) first, latest change first; the rest after. */
export function sortIdeas(list: readonly NoteIdea[]): NoteIdea[] {
  const open = (x: NoteIdea) => x.status === 'idea' || x.status === 'study';
  return [...list].sort((a, b) => Number(open(b)) - Number(open(a)) || b.updated - a.updated);
}

/** The idea's details as one note: why, the details, the first step, cost, link (empty parts left out). */
export function ideaNote(x: NoteIdea): string {
  return [
    x.why.trim() ? `ليه: ${x.why.trim()}` : '',
    x.note.trim(),
    x.first.trim() ? `أول خطوة: ${x.first.trim()}` : '',
    x.cost.trim() ? `التكلفة: ${x.cost.trim()}` : '',
    x.link.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

/** A goal from an idea: its why, one stage holding the details, the first step as its first task. */
export function toGoal(x: NoteIdea, today: string, now: number): Goal {
  const t = IDEA_TYPES[x.type];
  const note = ideaNote({ ...x, why: '' });
  return {
    id: goalId(now),
    name: x.title,
    icon: x.type === 'project' ? 'rocket' : x.type === 'work' ? 'briefcase' : x.type === 'app' ? 'phone-portrait' : 'flag',
    color: t.color,
    unit: '%',
    start: 0,
    target: 100,
    startDate: today,
    due: null,
    why: x.why.trim(),
    stages: [{ id: goalId(now, 1), title: 'البداية', ...(note ? { note } : {}), tasks: x.first.trim() ? [{ id: goalId(now, 2), title: x.first.trim(), done: null }] : [] }],
    entries: [],
    wins: [],
    reviews: [],
  };
}

/** A task from an idea (no day), its details in the note; a فسحة keeps its plan kind. */
export function toTask(x: NoteIdea, today: string, id: string): Task {
  const note = ideaNote(x);
  return { id, title: x.title, due: null, time: null, priority: 3, subs: [], repeat: null, remind: false, done: null, created: today, ...(note ? { note } : {}), ...(x.type === 'fun' ? { kind: x.kind ?? 'outing' } : {}) };
}
