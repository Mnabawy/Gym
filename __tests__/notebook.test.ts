import { ideaNote, newIdea, parseIdea, parseNotebook, sortIdeas, toGoal, toTask, type NoteIdea } from '../src/lib/notebook';

const D = '2026-11-19';
const base = newIdea('  محل عصير  ', D, 1000, { type: 'project', note: '• فوق البيت\n• ميزانية صغيرة', why: 'دخل تاني', first: 'أسأل عن الإيجار', cost: '50 ألف', link: 'https://example.com' });

describe('parse', () => {
  it('keeps a good idea, trims the title, defaults the rest', () => {
    expect(base.title).toBe('محل عصير');
    expect(parseIdea(base)).toEqual(base);
    expect(parseIdea({ id: 'a', title: 'x' })).toMatchObject({ type: 'other', status: 'idea', note: '', created: '2026-01-01' });
  });
  it('drops broken ones, keeps fields a newer build added', () => {
    expect(parseIdea({ id: 'a', title: '  ' })).toBeNull();
    expect(parseIdea({ title: 'x' })).toBeNull();
    expect(parseIdea({ ...base, mood: 'happy' })).toMatchObject({ mood: 'happy' });
    expect(parseIdea({ ...base, type: 'weird', status: 'nope', kind: 'flying' })).toMatchObject({ type: 'other', status: 'idea' });
    expect(parseNotebook(JSON.stringify([base, { id: 'b' }])).map((x) => x.id)).toEqual([base.id]);
  });
});

describe('sortIdeas', () => {
  it('open ones first, latest change first', () => {
    const l: NoteIdea[] = [
      { ...base, id: 'a', status: 'done', updated: 9 },
      { ...base, id: 'b', status: 'idea', updated: 1 },
      { ...base, id: 'c', status: 'study', updated: 5 },
      { ...base, id: 'd', status: 'dropped', updated: 3 },
    ];
    expect(sortIdeas(l).map((x) => x.id)).toEqual(['c', 'b', 'a', 'd']);
  });
});

describe('conversions carry the details', () => {
  it('ideaNote joins the parts that have something', () => {
    expect(ideaNote(base)).toBe('ليه: دخل تاني\n• فوق البيت\n• ميزانية صغيرة\nأول خطوة: أسأل عن الإيجار\nالتكلفة: 50 ألف\nhttps://example.com');
    expect(ideaNote(newIdea('x', D, 1))).toBe('');
  });
  it('toGoal: why, details on the first stage, first step as its task', () => {
    const g = toGoal(base, D, 5000);
    expect(g).toMatchObject({ name: 'محل عصير', why: 'دخل تاني', startDate: D, target: 100 });
    expect(g.stages).toHaveLength(1);
    expect(g.stages[0].note).toContain('• فوق البيت');
    expect(g.stages[0].note).not.toContain('ليه:');
    expect(g.stages[0].tasks.map((t) => t.title)).toEqual(['أسأل عن الإيجار']);
    expect(toGoal(newIdea('x', D, 1), D, 5).stages[0].tasks).toEqual([]);
  });
  it('toTask: no day, details in the note; a فسحة keeps its kind', () => {
    expect(toTask(base, D, 't1')).toMatchObject({ id: 't1', title: 'محل عصير', due: null, note: ideaNote(base) });
    expect(toTask({ ...base, type: 'fun' }, D, 't2').kind).toBe('outing');
    expect(toTask({ ...base, type: 'fun', kind: 'visit' }, D, 't3').kind).toBe('visit');
    expect(toTask(base, D, 't4').kind).toBeUndefined();
  });
});
