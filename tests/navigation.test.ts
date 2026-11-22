import assert from 'node:assert/strict';
import test from 'node:test';
import { navigationItems, navigationRedirects, resolveNavigation } from '../src/app/navigation.ts';

test('keeps eight primary entries in order and resolves settings separately', () => {
  assert.deepEqual(
    navigationItems.map(({ label }) => label),
    ['Hoy', 'Semana', 'Registros', 'Tareas', 'Calendario', 'Notas', 'Contraseñas', 'Herramientas'],
  );
  const { entry, tabs, title } = resolveNavigation('/ajustes');
  assert.equal(entry?.label, 'Ajustes');
  assert.deepEqual(tabs, []);
  assert.equal(title, 'Ajustes');
});

test('resolves the sidebar entry, tabs and breadcrumb from a secondary tab route', () => {
  const { entry, tabs, title } = resolveNavigation('/fichajes');
  assert.equal(entry?.label, 'Registros');
  assert.equal(entry?.to, '/partes-de-horas');
  assert.deepEqual(tabs, [
    { to: '/partes-de-horas', label: 'Partes' },
    { to: '/fichajes', label: 'Fichajes' },
  ]);
  assert.equal(title, 'Registros / Fichajes');
});

test('resolves Semana without tabs and redirects its previous routes', () => {
  const resolved = resolveNavigation('/semana');
  assert.equal(resolved.entry?.to, '/semana');
  assert.deepEqual(resolved.tabs, []);
  assert.equal(resolved.title, 'Semana');
  for (const from of ['/mi-semana', '/parte-semanal', '/tablero']) {
    assert.deepEqual(resolveNavigation(from), resolved);
  }
});

test('resolves aliases to their destination', () => {
  assert.deepEqual(navigationRedirects, [
    { from: '/mi-semana', to: '/semana' },
    { from: '/parte-semanal', to: '/semana' },
    { from: '/tablero', to: '/semana' },
    { from: '/registros', to: '/partes-de-horas' },
    { from: '/herramientas', to: '/porcentajes' },
  ]);
  for (const { from, to } of navigationRedirects) {
    const resolved = resolveNavigation(from);
    assert.deepEqual(resolved, resolveNavigation(to));
    assert.equal(resolved.tabs[0]?.to ?? resolved.entry?.to, to);
  }
  assert.equal(resolveNavigation('/registros').title, 'Registros / Partes');
});

test('returns the fallback breadcrumb for a route without a navigation entry', () => {
  assert.deepEqual(resolveNavigation('/desconocida'), {
    entry: null,
    tabs: [],
    title: 'Mi espacio',
  });
});
