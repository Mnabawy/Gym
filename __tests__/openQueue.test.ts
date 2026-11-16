/// <reference types="jest" />
import { openQueue } from '../src/lib/openQueue';

test('a tap before the app is ready waits, then opens once', () => {
  const nav = jest.fn();
  const q = openQueue(nav);
  q.open('/adhkar?time=morning');
  expect(nav).not.toHaveBeenCalled();
  q.ready();
  expect(nav).toHaveBeenCalledTimes(1);
  expect(nav).toHaveBeenCalledWith('/adhkar?time=morning');
  q.ready();
  expect(nav).toHaveBeenCalledTimes(1);
});

test('once ready, taps open right away; only the last waiting one opens', () => {
  const nav = jest.fn();
  const q = openQueue(nav);
  q.open('/a');
  q.open('/b');
  q.ready();
  expect(nav.mock.calls).toEqual([['/b']]);
  q.open('/c');
  expect(nav.mock.calls).toEqual([['/b'], ['/c']]);
});

test('the same tap reported twice is handled once', () => {
  const q = openQueue(() => {});
  expect(q.first('n1|default')).toBe(true);
  expect(q.first('n1|default')).toBe(false);
  expect(q.first('n2|default')).toBe(true);
});
