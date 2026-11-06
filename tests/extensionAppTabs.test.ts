import assert from 'node:assert/strict';
import test from 'node:test';

// A minimal `chrome` for the worker module: two Chambapp tabs and one unrelated tab.
type Sent = { tabId: number; message: { requestId: string; type: string; op: unknown } };
const sent: Sent[] = [];
let tabs = [
  { id: 1, url: 'https://chambapp-tracker.vercel.app/ajustes' },
  { id: 2, url: 'http://127.0.0.1:5173/proyectos' },
  { id: 3, url: 'https://example.com/' },
];
(globalThis as unknown as { chrome: unknown }).chrome = {
  tabs: {
    query: async () => tabs,
    sendMessage: async (tabId: number, envelope: { message: Sent['message'] }) => {
      sent.push({ tabId, message: envelope.message });
    },
  },
};
const { askApp, onLocalReply, NO_APP_TAB } = await import('../extension/src/background/appTabs.ts');

const user = '00000000-0000-4000-8000-000000000001';
const lastRequest = () => sent.at(-1)!.message.requestId;

test('asks only the Chambapp tabs and takes the first answer that can give the data', async () => {
  sent.length = 0;
  const answer = askApp<{ n: number }>(user, { kind: 'listar' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(
    sent.map((entry) => entry.tabId),
    [1, 2],
  );
  assert.equal(sent[0]!.message.type, 'local-request');
  const id = lastRequest();
  // A tab that was not asked, then a locked tab, then one that answers.
  onLocalReply({ requestId: id, ok: true, error: '', data: { n: 99 } }, 3);
  onLocalReply({ requestId: id, ok: false, error: 'bloqueado' }, 1);
  onLocalReply({ requestId: id, ok: true, error: '', data: { n: 1 } }, 2);
  assert.deepEqual(await answer, { n: 1 });
});

test('fails with the first reason when every tab refuses, and when there is no tab', async () => {
  sent.length = 0;
  const answer = askApp(user, { kind: 'listar' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const id = lastRequest();
  onLocalReply({ requestId: id, ok: false, error: 'Datos bloqueados' }, 1);
  onLocalReply({ requestId: id, ok: false, error: 'Otro motivo' }, 2);
  await assert.rejects(answer, /Datos bloqueados/);
  tabs = [{ id: 3, url: 'https://example.com/' }];
  await assert.rejects(
    askApp(user, { kind: 'listar' }),
    (error: Error) => error.message === NO_APP_TAB,
  );
});

test('gives up after the timeout when no tab answers', async () => {
  tabs = [{ id: 1, url: 'https://chambapp-tracker.vercel.app/' }];
  await assert.rejects(
    askApp(user, { kind: 'listar' }, 50),
    (error: Error) => error.message === NO_APP_TAB,
  );
});
