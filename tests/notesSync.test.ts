import test from 'node:test';
import assert from 'node:assert/strict';
import { syncScrollTarget } from '../src/features/notes/notes.model.ts';
import { paginate } from '../src/lib/paginate.ts';

const pane = (scrollTop: number, scrollHeight: number, clientHeight = 400) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});

test('maps the proportional scroll position between panes of different heights', () => {
  assert.equal(syncScrollTarget(pane(0, 1400), pane(0, 2400)), 0);
  assert.equal(syncScrollTarget(pane(500, 1400), pane(0, 2400)), 1000);
  assert.equal(syncScrollTarget(pane(1000, 1400), pane(0, 2400)), 2000);
  // Reverse direction.
  assert.equal(syncScrollTarget(pane(1000, 2400), pane(0, 1400)), 500);
});

test('handles panes that do not scroll and out-of-range positions', () => {
  assert.equal(syncScrollTarget(pane(0, 300), pane(0, 2400)), 0);
  assert.equal(syncScrollTarget(pane(200, 1400), pane(0, 300)), 0);
  assert.equal(syncScrollTarget(pane(5000, 1400), pane(0, 2400)), 2000);
  assert.equal(syncScrollTarget(pane(-20, 1400), pane(0, 2400)), 0);
});

test('shared paginate helper pages notes lists', () => {
  const notes = Array.from({ length: 17 }, (_, index) => index);
  assert.deepEqual(paginate(notes, 3, 8), { items: [16], page: 3, pages: 3 });
});
