// Notes with bullet points (stage details in a goal's road): plain text where a line that starts with "• ", "- " or
// "* " is a bullet. The editor (src/components/NoteEditor.tsx) writes "• "; pasted "- " lists work too. Pure.

export type NoteBlock = { kind: 'bullet' | 'text'; text: string };

const BULLET = /^\s*[•\-*](\s+|$)/;
export const BULLET_MARK = '• ';

export const isBullet = (line: string) => BULLET.test(line);

/** The note as blocks: each bullet line on its own, runs of plain lines joined into one paragraph. Empty lines split paragraphs. */
export function parseNote(text: string): NoteBlock[] {
  const out: NoteBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: 'text', text: para.join('\n') });
    para = [];
  };
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (isBullet(line)) {
      flush();
      const t = line.replace(BULLET, '').trim();
      if (t) out.push({ kind: 'bullet', text: t });
    } else if (!line.trim()) flush();
    else para.push(line.trim());
  }
  flush();
  return out;
}

/** Which line the cursor is on, and where that line starts and ends. */
function lineAt(text: string, pos: number) {
  const start = text.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
  const nl = text.indexOf('\n', pos);
  return { start, end: nl < 0 ? text.length : nl };
}

/** Turns the line under the cursor into a bullet, or back into plain text. Returns the new text and cursor. */
export function toggleBullet(text: string, pos: number): { text: string; pos: number } {
  const { start, end } = lineAt(text, pos);
  const line = text.slice(start, end);
  if (isBullet(line)) {
    const bare = line.replace(BULLET, '');
    const cut = line.length - bare.length;
    return { text: text.slice(0, start) + bare + text.slice(end), pos: Math.max(start, pos - cut) };
  }
  return { text: text.slice(0, start) + BULLET_MARK + line + text.slice(end), pos: pos + BULLET_MARK.length };
}

/**
 * After typing: a new line right after a bullet starts with a bullet too; Enter on an empty bullet ends the list
 * (the empty bullet goes). `prev` is the text before the change.
 */
export function continueBullets(prev: string, next: string): string {
  if (next.length !== prev.length + 1) return next;
  let i = 0;
  while (i < prev.length && prev[i] === next[i]) i++;
  // Enter right before a line break: the new break is the first of the two, at the end of the line you were on.
  while (i > 0 && next[i - 1] === '\n' && next[i] === '\n') i--;
  if (next[i] !== '\n') return next;
  const { start } = lineAt(next, i);
  const line = next.slice(start, i);
  if (!isBullet(line)) return next;
  if (!line.replace(BULLET, '').trim()) return next.slice(0, start) + next.slice(i + 1); // empty bullet: end the list
  return next.slice(0, i + 1) + BULLET_MARK + next.slice(i + 1);
}
