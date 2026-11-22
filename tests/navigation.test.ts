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
  const { entry, tabs, title } = resolveNavigation('/parte-semanal');
  assert.equal(entry?.label, 'Semana');
  assert.equal(entry?.to, '/mi-semana');
  assert.deepEqual(tabs, [
    { to: '/mi-semana', label: 'Mi semana' },
    { to: '/parte-semanal', label: 'Partes por tarea' },
  ]);
  assert.equal(title, 'Semana / Partes por tarea');
});

test('resolves each section alias as its first tab', () => {
  assert.deepEqual(navigationRedirects, [
    { from: '/semana', to: '/mi-semana' },
    { from: '/registros', to: '/partes-de-horas' },
    { from: '/herramientas', to: '/porcentajes' },
  ]);
  for (const { from, to } of navigationRedirects) {
    const resolved = resolveNavigation(from);
    assert.deepEqual(resolved, resolveNavigation(to));
    assert.equal(resolved.tabs[0]?.to, to);
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
