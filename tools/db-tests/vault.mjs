import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

// The database never decrypts: any well-formed envelope stands in for ciphertext.
const envelope = (size = 32) =>
  `v1.${randomBytes(12).toString('base64url')}.${randomBytes(size).toString('base64url')}`;

export async function verifyVault({ admin, client, rpc, expectError, ok }) {
  const userA = randomUUID();
  const userB = randomUUID();
  await admin.query('insert into auth.users values ($1,$2),($3,$4)', [
    userA,
    { nombre: 'Vault A' },
    userB,
    { nombre: 'Vault B' },
  ]);
  const ca = await client(userA);
  const cb = await client(userB);
  const call = async (connection, fn, action, data) =>
    (await connection.query(`select public.${fn}($1,$2) r`, [action, data])).rows[0].r;
  const vault = (c, action, data) => call(c, 'chambapp_boveda', action, data);
  const notes = (c, action, data) => call(c, 'chambapp_notas', action, data);
  const credentials = (c, action, data) => call(c, 'chambapp_credenciales', action, data);
  const wrapped = () => ({
    sal: randomBytes(16).toString('base64url'),
    iteraciones: 600000,
    clave_envuelta: envelope(48),
  });

  // Legacy plaintext note created before the vault exists.
  const project = await rpc(ca, 'crear_proyecto', { nombre: 'Proyecto con secretos' });
  const legacy = await notes(ca, 'guardar_nota', {
    id: randomUUID(),
    titulo: 'Antigua',
    contenido_md: 'texto en claro',
    proyecto_ids: [project.id],
    tarea_ids: [],
  });

  await expectError(
    () =>
      credentials(ca, 'guardar_credencial', {
        id: randomUUID(),
        proyecto_id: project.id,
        boveda_generacion: randomUUID(),
        cifrado: envelope(),
      }),
    /BOVEDA_CAMBIADA/,
  );
  const generation = randomUUID();
  const created = { generacion: generation, ...wrapped() };
  const first = await vault(ca, 'crear_boveda', created);
  assert.equal(first.generacion, generation);
  assert.deepEqual(await vault(ca, 'crear_boveda', created), first);
  await expectError(
    () => vault(ca, 'crear_boveda', { generacion: randomUUID(), ...wrapped() }),
    /BOVEDA_EXISTENTE/,
  );
  await expectError(
    () => vault(ca, 'crear_boveda', { ...created, iteraciones: 1000 }),
    /BOVEDA_DATOS_INVALIDOS/,
  );
  assert.equal((await cb.query('select * from public.bovedas')).rows.length, 0);
  assert.equal((await ca.query('select * from public.bovedas')).rows.length, 1);
  for (const [sql, values] of [
    [
      'insert into public.bovedas(usuario_id,generacion,sal,iteraciones,clave_envuelta) values($1,$2,$3,$4,$5)',
      [userB, randomUUID(), created.sal, 600000, created.clave_envuelta],
    ],
    ['update public.bovedas set iteraciones=100000', []],
    ['delete from public.bovedas', []],
    ['delete from public.credenciales', []],
  ])
    await expectError(() => ca.query(sql, values), /permission denied/);
  ok('vaults are created once per account, retries are idempotent and direct writes are denied');

  // Notes must be encrypted once a vault exists, also through direct table writes.
  await expectError(
    () =>
      notes(ca, 'guardar_nota', {
        id: randomUUID(),
        titulo: 'En claro',
        contenido_md: 'x',
        proyecto_ids: [],
        tarea_ids: [],
      }),
    /NOTA_DEBE_CIFRARSE/,
  );
  await expectError(
    () =>
      admin.query(
        "insert into public.notas(id,usuario_id,titulo,contenido_md) values($1,$2,'Directa','x')",
        [randomUUID(), userA],
      ),
    /NOTA_DEBE_CIFRARSE/,
  );
  await expectError(
    () =>
      admin.query(
        "insert into public.notas(id,usuario_id,titulo,contenido_md,cifrado,boveda_generacion) values($1,$2,'','',$3,$4)",
        [randomUUID(), userA, envelope(), randomUUID()],
      ),
    /BOVEDA_CAMBIADA/,
  );
  const sealed = envelope(64);
  const migrated = await notes(ca, 'guardar_nota', {
    id: legacy.id,
    version: legacy.version,
    cifrado: sealed,
    boveda_generacion: generation,
    proyecto_ids: [project.id],
    tarea_ids: [],
  });
  assert.equal(migrated.titulo, '');
  assert.equal(migrated.contenido_md, '');
  assert.equal(migrated.cifrado, sealed);
  assert.equal(migrated.version, legacy.version + 1);
  const encryptedPayload = {
    id: randomUUID(),
    cifrado: envelope(),
    boveda_generacion: generation,
    proyecto_ids: [],
    tarea_ids: [],
  };
  const encrypted = await notes(ca, 'guardar_nota', encryptedPayload);
  assert.deepEqual(await notes(ca, 'guardar_nota', encryptedPayload), encrypted);
  await expectError(
    () => notes(ca, 'guardar_nota', { ...encryptedPayload, cifrado: envelope() }),
    /NOTA_ID_REUTILIZADO/,
  );
  await expectError(
    () => notes(ca, 'guardar_nota', { ...encryptedPayload, id: randomUUID(), titulo: 'x' }),
    /NOTA_DATOS_INVALIDOS/,
  );
  await expectError(
    () =>
      notes(ca, 'guardar_nota', {
        ...encryptedPayload,
        id: randomUUID(),
        cifrado: `v1.${'A'.repeat(16)}.${'B'.repeat(1400000)}`,
      }),
    /NOTA_DEMASIADO_GRANDE/,
  );
  ok(
    'notes are migrated to ciphertext, plaintext is rejected after the vault exists and retries stay idempotent',
  );

  // Credentials.
  const otherProject = await rpc(cb, 'crear_proyecto', { nombre: 'Ajeno' });
  const credential = {
    id: randomUUID(),
    proyecto_id: project.id,
    boveda_generacion: generation,
    cifrado: envelope(200),
  };
  const savedCredential = await credentials(ca, 'guardar_credencial', credential);
  assert.equal(savedCredential.version, 1);
  assert.deepEqual(await credentials(ca, 'guardar_credencial', credential), savedCredential);
  await expectError(
    () => credentials(ca, 'guardar_credencial', { ...credential, cifrado: envelope() }),
    /CREDENCIAL_ID_REUTILIZADO/,
  );
  await expectError(
    () =>
      credentials(ca, 'guardar_credencial', {
        ...credential,
        id: randomUUID(),
        proyecto_id: otherProject.id,
      }),
    /PROYECTO_NO_DISPONIBLE/,
  );
  await expectError(
    () =>
      credentials(ca, 'guardar_credencial', {
        ...credential,
        id: randomUUID(),
        boveda_generacion: randomUUID(),
      }),
    /BOVEDA_CAMBIADA/,
  );
  await expectError(
    () =>
      credentials(ca, 'guardar_credencial', {
        ...credential,
        id: randomUUID(),
        cifrado: `v1.${'A'.repeat(16)}.${'B'.repeat(262144)}`,
      }),
    /CREDENCIAL_DEMASIADO_GRANDE/,
  );
  const edited = await credentials(ca, 'guardar_credencial', {
    ...credential,
    version: 1,
    cifrado: envelope(300),
  });
  assert.equal(edited.version, 2);
  await expectError(
    () => credentials(ca, 'guardar_credencial', { ...credential, version: 1 }),
    /CONFLICTO_VERSION/,
  );
  await expectError(
    () => credentials(cb, 'eliminar_credencial', { id: credential.id, version: 2 }),
    /CREDENCIAL_NO_DISPONIBLE/,
  );
  assert.equal((await cb.query('select * from public.credenciales')).rows.length, 0);
  assert.equal((await cb.query('select * from public.credenciales_detalle')).rows.length, 0);
  assert.equal((await ca.query('select * from public.credenciales_detalle')).rows.length, 1);
  ok('credentials are owner-only, versioned, bound to a live own project and retried safely');

  // Soft-deleting a project through the normal RPC removes its credentials.
  const temporary = await rpc(ca, 'crear_proyecto', { nombre: 'Temporal' });
  const doomed = await credentials(ca, 'guardar_credencial', {
    id: randomUUID(),
    proyecto_id: temporary.id,
    boveda_generacion: generation,
    cifrado: envelope(),
  });
  await rpc(ca, 'eliminar_proyecto', {
    id: temporary.id,
    version: temporary.version,
    confirmar_cascada: true,
  });
  assert.equal(
    (await admin.query('select count(*)::int n from public.credenciales where id=$1', [doomed.id]))
      .rows[0].n,
    0,
  );
  ok('deleting a project with eliminar_proyecto deletes its credentials');

  // Changing the master password keeps the generation and requires version + generation.
  const current = (await ca.query('select * from public.bovedas')).rows[0];
  const staleRewrap = {
    generacion: generation,
    version: Number(current.version),
    ...wrapped(),
  };
  // A missing generation never matches (no SQL NULL shortcut).
  const { generacion: _omit, ...withoutGeneration } = staleRewrap;
  void _omit;
  await expectError(() => vault(ca, 'cambiar_clave', withoutGeneration), /BOVEDA_DATOS_INVALIDOS/);
  await expectError(
    () => vault(ca, 'restablecer_boveda', { confirmacion: 'BORRAR' }),
    /BOVEDA_DATOS_INVALIDOS/,
  );
  await expectError(
    () =>
      notes(ca, 'guardar_nota', {
        ...encryptedPayload,
        id: randomUUID(),
        boveda_generacion: undefined,
      }),
    /NOTA_DATOS_INVALIDOS/,
  );
  await expectError(
    () =>
      credentials(ca, 'guardar_credencial', {
        ...credential,
        id: randomUUID(),
        proyecto_id: undefined,
      }),
    /CREDENCIAL_DATOS_INVALIDOS/,
  );
  assert.equal((await ca.query('select count(*)::int n from public.bovedas')).rows[0].n, 1);
  const rewrapped = await vault(ca, 'cambiar_clave', staleRewrap);
  assert.equal(rewrapped.generacion, generation);
  assert.equal(rewrapped.version, Number(current.version) + 1);
  await expectError(() => vault(ca, 'cambiar_clave', staleRewrap), /CONFLICTO_VERSION/);
  ok('master password changes keep the generation and reject stale versions');

  // Reset in one tab, recreation, then delayed requests from the old generation.
  const pendingRewrap = { generacion: generation, version: rewrapped.version, ...wrapped() };
  await expectError(
    () => vault(ca, 'restablecer_boveda', { generacion: generation, confirmacion: 'no' }),
    /CONFIRMACION_REQUERIDA/,
  );
  await expectError(
    () => vault(ca, 'restablecer_boveda', { generacion: randomUUID(), confirmacion: 'BORRAR' }),
    /BOVEDA_CAMBIADA/,
  );
  const plainB = await notes(cb, 'guardar_nota', {
    id: randomUUID(),
    titulo: 'De B',
    contenido_md: 'intacta',
    proyecto_ids: [],
    tarea_ids: [],
  });
  const reset = await vault(ca, 'restablecer_boveda', {
    generacion: generation,
    confirmacion: 'BORRAR',
  });
  assert.equal(reset.restablecida, true);
  assert.equal((await ca.query('select count(*)::int n from public.notas')).rows[0].n, 0);
  assert.equal((await ca.query('select count(*)::int n from public.credenciales')).rows[0].n, 0);
  assert.equal(
    (await admin.query('select count(*)::int n from public.notas where id=$1', [plainB.id])).rows[0]
      .n,
    1,
  );
  const plainAfterReset = await notes(ca, 'guardar_nota', {
    id: randomUUID(),
    titulo: 'Sin bóveda',
    contenido_md: 'se conserva',
    proyecto_ids: [],
    tarea_ids: [],
  });
  const newGeneration = randomUUID();
  await vault(ca, 'crear_boveda', { generacion: newGeneration, ...wrapped() });
  await expectError(() => vault(ca, 'cambiar_clave', pendingRewrap), /BOVEDA_CAMBIADA/);
  await expectError(
    () => notes(ca, 'guardar_nota', { ...encryptedPayload, id: randomUUID() }),
    /BOVEDA_CAMBIADA/,
  );
  await expectError(
    () => credentials(ca, 'guardar_credencial', { ...credential, id: randomUUID() }),
    /BOVEDA_CAMBIADA/,
  );
  await expectError(
    () => vault(ca, 'restablecer_boveda', { generacion: generation, confirmacion: 'BORRAR' }),
    /BOVEDA_CAMBIADA/,
  );
  assert.equal(
    (await ca.query('select count(*)::int n from public.notas where id=$1', [plainAfterReset.id]))
      .rows[0].n,
    1,
  );
  ok(
    'reset deletes only encrypted data of the account and stale generations cannot write afterwards',
  );
}
