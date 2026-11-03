import assert from 'node:assert/strict';
import test from 'node:test';
import { safeReturnTo } from '../src/features/auth/returnTo.ts';

const origin = 'https://chambapp.example';

test('preserves supported workspace destinations, filters, and section anchors', () => {
  for (const destination of [
    '/resumen',
    '/proyectos',
    '/tareas',
    '/tablero',
    '/parte-semanal',
    '/notas',
    '/calendario',
    '/partes-de-horas',
    '/fichajes?fecha=2026-10-02',
    '/mi-semana',
    '/porcentajes',
    '/calculadora-de-horas',
    '/datos-ficticios',
    '/onboarding',
    '/ajustes?returnTo=%2Fproyectos#regional',
  ]) {
    assert.equal(safeReturnTo(destination, origin), destination);
  }
});

test('rejects external origins, protocol URLs, backslashes, and unsupported routes', () => {
  for (const destination of [
    null,
    undefined,
    '',
    'https://attacker.example/resumen',
    'https://chambapp.example/ajustes',
    '//attacker.example/resumen',
    '/\\attacker.example/resumen',
    '\\resumen',
    'javascript:alert(1)',
    '/login',
    '/registro',
    '/recuperar-contrasena',
    '/unknown',
    '/resumen%2F..%2Flogin',
    '/%5C%5Cattacker.example/resumen',
  ]) {
    assert.equal(safeReturnTo(destination, origin), '/resumen', String(destination));
  }
});

test('normalizes local path traversal and retains only a known destination', () => {
  assert.equal(safeReturnTo('/another/../ajustes#regional', origin), '/ajustes#regional');
  assert.equal(safeReturnTo('/ajustes/../login', origin), '/resumen');
});
