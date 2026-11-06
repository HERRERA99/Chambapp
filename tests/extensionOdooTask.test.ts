import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanProjectName,
  findExistingTask,
  normalizeOdooCode,
  parseOdooTaskUrl,
  splitTaskTitle,
  suggestProject,
} from '../extension/src/shared/odooTask.ts';

const origin = 'https://empresa.odoo.com';

test('parseOdooTaskUrl recognises Odoo 17/18 routes and the legacy /web hash', () => {
  assert.deepEqual(parseOdooTaskUrl(`${origin}/odoo/project/5/tasks/123`), {
    origin,
    recordId: 123,
  });
  assert.deepEqual(parseOdooTaskUrl(`${origin}/odoo/project.task/77`), { origin, recordId: 77 });
  assert.deepEqual(parseOdooTaskUrl(`${origin}/odoo/my-tasks/9`), { origin, recordId: 9 });
  assert.deepEqual(parseOdooTaskUrl(`${origin}/odoo/action-project.action_view_all_task/41`), {
    origin,
    recordId: 41,
  });
  assert.deepEqual(
    parseOdooTaskUrl(
      `${origin}/web#id=443212&cids=1&menu_id=4&action=310&model=project.task&view_type=form`,
    ),
    { origin, recordId: 443212 },
  );
  assert.equal(parseOdooTaskUrl(`${origin}/web#id=5&model=res.partner&view_type=form`), null);
  assert.equal(parseOdooTaskUrl(`${origin}/odoo/project/5`), null);
  assert.equal(parseOdooTaskUrl(`${origin}/odoo/action-310/12`), null);
  assert.deepEqual(parseOdooTaskUrl(`${origin}/odoo/action-310/12`, { assumeTask: true }), {
    origin,
    recordId: 12,
  });
  assert.equal(parseOdooTaskUrl('ftp://empresa.odoo.com/odoo/project.task/1'), null);
  assert.equal(parseOdooTaskUrl('https://user:pw@empresa.odoo.com/odoo/project.task/1'), null);
  assert.equal(parseOdooTaskUrl('no es una url'), null);
});

test('cleanProjectName and normalizeOdooCode', () => {
  assert.equal(cleanProjectName('[PRJ-01]  Web   corporativa '), 'Web corporativa');
  assert.equal(cleanProjectName('Interno'), 'Interno');
  assert.equal(normalizeOdooCode(' t443212 '), 'T443212');
  assert.equal(normalizeOdooCode('TAREA-1'), null);
  assert.equal(normalizeOdooCode(''), null);
  assert.equal(normalizeOdooCode(null), null);
});

const task = (
  id: string,
  odoo_id: string | null,
  odoo_url: string | null,
  eliminado_en = null,
) => ({
  id,
  titulo: id,
  proyecto_id: 'p',
  odoo_id,
  odoo_url,
  eliminado_en,
});

test('findExistingTask: same record is "same", code-only match is "possible"', () => {
  const detected = { origin, recordId: 123, code: 'T123' };
  const same = task('a', 'T123', `${origin}/odoo/project/5/tasks/123`);
  assert.deepEqual(findExistingTask([same], detected), { kind: 'same', task: same });
  const legacyUrl = task('b', null, `${origin}/web#id=123&model=project.task&view_type=form`);
  assert.equal(findExistingTask([legacyUrl], detected)?.kind, 'same');
  // Same code on another Odoo instance is only a possible duplicate.
  const other = task('c', 'T123', 'https://otra.odoo.com/odoo/project/5/tasks/123');
  assert.deepEqual(findExistingTask([other], detected), { kind: 'possible', task: other });
  const codeOnly = task('d', 'T123', null);
  assert.equal(findExistingTask([codeOnly], detected)?.kind, 'possible');
  assert.equal(findExistingTask([task('e', 'T999', null)], detected), null);
  const deleted = { ...same, eliminado_en: '2026-01-01T00:00:00Z' };
  assert.equal(findExistingTask([deleted], detected), null);
  assert.equal(findExistingTask([codeOnly], { ...detected, code: null }), null);
});

test('suggestProject matches names ignoring case, accents and the [CODE] prefix', () => {
  const projects = [
    { id: '1', nombre: 'Formación', archivado_en: null, eliminado_en: null },
    { id: '2', nombre: 'Web', archivado_en: '2026-01-01', eliminado_en: null },
    { id: '3', nombre: 'Soporte', archivado_en: null, eliminado_en: '2026-01-01' },
  ];
  assert.equal(suggestProject(projects, '[F] FORMACION')?.id, '1');
  assert.equal(suggestProject(projects, 'Web'), null);
  assert.equal(suggestProject(projects, 'Soporte'), null);
  assert.equal(suggestProject(projects, ''), null);
});

test('splitTaskTitle takes the T code from "[T…] title" and leaves the rest', () => {
  assert.deepEqual(splitTaskTitle('[T457973] Revisar  informe'), {
    code: 'T457973',
    title: 'Revisar informe',
  });
  assert.deepEqual(splitTaskTitle('[t12] Minúsculas'), { code: 'T12', title: 'Minúsculas' });
  assert.deepEqual(splitTaskTitle('Sin código'), { code: null, title: 'Sin código' });
  assert.deepEqual(splitTaskTitle('[P0431] Kialens'), { code: null, title: '[P0431] Kialens' });
  assert.deepEqual(splitTaskTitle('Revisar [T1]'), { code: null, title: 'Revisar [T1]' });
  // Nothing left after the code: keep the original title.
  assert.deepEqual(splitTaskTitle('[T1]'), { code: 'T1', title: '[T1]' });
});
