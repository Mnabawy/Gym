// Cloud sync (cloud.ts): a copy of the phone's data (the backup file format, without photos) and the coach summary go
// up; a new phone can bring the copy back; plans a coach sent come down to be taken or not. The phone stays the source:
// nothing is merged, the copy on the server is simply the last one this account sent.
import { PROGRAM, PLAN_WEEKDAYS, type Template } from '../data/program';
import { BUILD } from './buildInfo';
import { parseBackup, toBackup } from './backup';
import { clientStats, parseStats, type ClientStats } from './coach';
import { db, getSession, rpc } from './cloud';
import { report } from './errlog';
import { plateauInput } from './plateauData';
import { applyBackup } from './restore';
import { deloadOn, useSettings } from './settings';
import { storage } from './storage';
import { nextDayId, parsePastDays, parseTemplate, PAST_DAYS_KEY, TEMPLATE_KEY } from './template';

export const SYNC_AT_KEY = 'cloudSyncAt';
export const SYNC_ERROR_KEY = 'cloudError';

export type Profile = { id: string; role: 'client' | 'coach'; name: string; coach_id: string | null; invite_code: string | null };
export type PlanRow = { id: number; coach_id: string; client_id: string; template: unknown; note: string; created_at: string; applied_at: string | null };

const uid = () => getSession()?.user.id ?? '';

/** Your profile, made the first time. */
export async function myProfile(name = ''): Promise<Profile> {
  const id = uid();
  const rows = await db<Profile[]>(`profiles?id=eq.${id}&select=*`);
  if (rows[0]) return rows[0];
  await db('profiles', { method: 'POST', body: { id, name: name.slice(0, 60) }, prefer: 'resolution=ignore-duplicates,return=minimal' });
  return (await db<Profile[]>(`profiles?id=eq.${id}&select=*`))[0];
}
export const setName = (name: string) => db(`profiles?id=eq.${uid()}`, { method: 'PATCH', body: { name: name.trim().slice(0, 60) }, prefer: 'return=minimal' });
export const becomeCoach = () => rpc<string>('become_coach');
/** The coach's name, or null when the code is wrong. null code = leave your coach. */
export const joinCoach = (code: string | null) => rpc<string | null>('join_coach', { code });

/** This phone's summary for the coach. */
export function myStats(): ClientStats {
  const trained = storage.trainedDays();
  const t = (() => {
    try {
      return parseTemplate(storage.getMeta(TEMPLATE_KEY));
    } catch {
      return null;
    }
  })();
  return clientStats(plateauInput(deloadOn(useSettings.getState())), trained.length ? trained[trained.length - 1].date : null, {
    days: PROGRAM.map((d) => d.titleAr),
    goal: t?.goal ?? '',
    level: t?.level ?? '',
    weekdays: [...PLAN_WEEKDAYS],
  });
}

/** Sends the copy of your data and your summary. Never throws: a failure is noted (meta cloudError) for settings. */
export async function syncUp(now: Date = new Date()): Promise<boolean> {
  if (!getSession()) return false;
  try {
    const id = uid();
    const data = JSON.parse(toBackup(storage.dump(), now));
    const up = (table: string, body: object) => db(`${table}?on_conflict=user_id`, { method: 'POST', body, prefer: 'resolution=merge-duplicates,return=minimal' });
    await up('snapshots', { user_id: id, data, build: BUILD.sha, updated_at: now.toISOString() });
    await up('stats', { user_id: id, data: myStats(), updated_at: now.toISOString() });
    storage.setMeta(SYNC_AT_KEY, now.toISOString());
    storage.setMeta(SYNC_ERROR_KEY, '');
    return true;
  } catch (e) {
    storage.setMeta(SYNC_ERROR_KEY, e instanceof Error ? e.message : String(e));
    report(e, 'syncUp');
    return false;
  }
}

/** The copy on the server: when it was sent and what's in it, or null when there's none. */
export async function cloudCopy(): Promise<{ at: string; text: string } | null> {
  const rows = await db<{ data: unknown; updated_at: string }[]>(`snapshots?user_id=eq.${uid()}&select=data,updated_at`);
  return rows[0] ? { at: rows[0].updated_at, text: JSON.stringify(rows[0].data) } : null;
}

/** Puts the server's copy on this phone (a safety copy of the phone first, like any restore). */
export async function restoreFromCloud(): Promise<boolean> {
  const c = await cloudCopy();
  if (!c) return false;
  const p = parseBackup(c.text);
  if (!p.ok) throw new Error(p.error);
  await applyBackup(p.data, []);
  return true;
}

/** The newest plan your coach sent that you haven't taken yet. */
export async function pendingPlan(): Promise<{ row: PlanRow; template: Template } | null> {
  const rows = await db<PlanRow[]>(`plans?client_id=eq.${uid()}&applied_at=is.null&order=created_at.desc&limit=1`);
  const t = rows[0] ? parseTemplate(JSON.stringify(rows[0].template)) : null;
  return rows[0] && t ? { row: rows[0], template: t } : null;
}

/** Renumbers a plan's days to ids free on this phone (a coach's ids can clash with days you had). */
export function localIds(t: Template): Template {
  const start = nextDayId(parsePastDays(storage.getMeta(PAST_DAYS_KEY)), PROGRAM.map((d) => d.weekday));
  return { ...t, days: t.days.map((d, i) => ({ ...d, id: start + i })) };
}

/** Take the coach's plan: it becomes your program, and the coach sees it was taken. */
export async function takePlan(p: { row: PlanRow; template: Template }): Promise<void> {
  useSettings.getState().setTemplate(localIds(p.template));
  storage.setMeta('setupDone', '1');
  await db(`plans?id=eq.${p.row.id}`, { method: 'PATCH', body: { applied_at: new Date().toISOString() }, prefer: 'return=minimal' });
  void syncUp();
}

// Coach side.
export type Client = { id: string; name: string; stats: ClientStats | null; statsAt: string | null };

export async function myClients(): Promise<Client[]> {
  const people = await db<{ id: string; name: string }[]>(`profiles?coach_id=eq.${uid()}&select=id,name&order=name`);
  if (!people.length) return [];
  const stats = await db<{ user_id: string; data: unknown; updated_at: string }[]>(`stats?user_id=in.(${people.map((p) => p.id).join(',')})&select=user_id,data,updated_at`);
  return people.map((p) => {
    const s = stats.find((x) => x.user_id === p.id);
    return { id: p.id, name: p.name, stats: s ? parseStats(s.data) : null, statsAt: s?.updated_at ?? null };
  });
}

export const sendPlan = (clientId: string, template: Template, note: string) =>
  db('plans', { method: 'POST', body: { coach_id: uid(), client_id: clientId, template, note: note.slice(0, 500) }, prefer: 'return=minimal' });

/** The last plans sent to a client (taken or not). */
export const plansFor = (clientId: string) => db<PlanRow[]>(`plans?client_id=eq.${clientId}&coach_id=eq.${uid()}&order=created_at.desc&limit=5`);
