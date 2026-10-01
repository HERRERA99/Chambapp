import { readFile, readdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = resolve(root, 'node_modules/supabase/dist/supabase.js');
const action = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  if (action === '--help' || action === 'help') {
    console.log('Uso: npm run db:link | db:plan | db:migrate | db:status');
    console.log('Destino: supabase/project.json o SUPABASE_PROJECT_REF en el entorno/.env.local.');
    console.log('Para otra referencia: npm run db:plan -- --project-ref <ref>');
    return;
  }
  if (!['link', 'plan', 'migrate', 'status'].includes(action))
    throw new Error('Acción no admitida. Usa --help.');
  await access(cli).catch(() => {
    throw new Error('Instala las dependencias del proyecto con npm ci.');
  });
  let ref = process.env.SUPABASE_PROJECT_REF;
  if (!ref) {
    const env = await readFile(resolve(root, '.env.local'), 'utf8').catch((e) => {
      if (e.code === 'ENOENT') return '';
      throw e;
    });
    const match = env.match(/^\s*SUPABASE_PROJECT_REF\s*=\s*([^\r\n]*)$/m);
    if (match) ref = match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  if (!ref)
    ref = JSON.parse(await readFile(resolve(root, 'supabase/project.json'), 'utf8')).project_ref;
  const explicitRefIndex = args.indexOf('--project-ref');
  if (explicitRefIndex >= 0) {
    ref = args[explicitRefIndex + 1];
    args.splice(explicitRefIndex, 2);
  }
  if (!ref || !/^[a-z]{20}$/.test(ref))
    throw new Error(
      'Falta el proyecto destino. Configura project_ref en supabase/project.json o SUPABASE_PROJECT_REF con la referencia de Supabase (20 letras).',
    );
  const migrations = (await readdir(resolve(root, 'supabase/migrations'))).filter((f) =>
    /^\d+_.+\.sql$/.test(f),
  );
  if (!migrations.length) throw new Error('No hay migraciones locales.');
  // Keep the chosen target explicit; forbid flags that would silently replace it.
  if (args.some((a) => /^--(?:db-url|local|linked|workdir|project-ref)(?:=|$)/.test(a))) {
    throw new Error(
      'Estos comandos usan un destino explícito. Para otros entornos utiliza db:cli.',
    );
  }
  const commands = {
    link: ['link', '--project-ref', ref],
    plan: ['db', 'push', '--project-ref', ref, '--dry-run'],
    migrate: ['db', 'push', '--project-ref', ref],
    status: ['migration', 'list', '--project-ref', ref],
  };
  console.log(`Supabase: ${action} → ${ref} (${migrations.length} migración/es local/es).`);
  const child = spawn(process.execPath, [cli, ...commands[action], ...args], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  await new Promise((res, rej) => {
    child.once('error', rej);
    child.once('exit', (code, signal) => {
      if (code === 0) res();
      else rej(new Error(`Supabase terminó con ${signal ?? code}.`));
    });
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
