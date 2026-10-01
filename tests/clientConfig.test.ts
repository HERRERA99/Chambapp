import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicApiKey, isSupabaseUrl } from '../src/lib/supabase/clientConfig.ts';

const jwt = (role: string) =>
  `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

test('permits only publishable keys and legacy anon JWTs in frontend configuration', () => {
  assert.equal(isPublicApiKey('sb_publishable_example'), true);
  assert.equal(isPublicApiKey(jwt('anon')), true);
  assert.equal(isPublicApiKey(jwt('service_role')), false);
  assert.equal(isPublicApiKey(jwt('authenticated')), false);
  assert.equal(isPublicApiKey('sb_secret_example'), false);
  assert.equal(isPublicApiKey(undefined), false);
  assert.equal(isPublicApiKey('sb_publishable_'), false);
  assert.equal(isPublicApiKey('malformed.key.data'), false);
});

test('invalid URLs are reported as configuration errors before creating the SDK client', () => {
  assert.equal(isSupabaseUrl('https://project.supabase.co'), true);
  assert.equal(isSupabaseUrl('http://127.0.0.1:54321'), true);
  assert.equal(isSupabaseUrl('http://'), false);
  assert.equal(isSupabaseUrl('file:///tmp/database'), false);
  assert.equal(isSupabaseUrl('https://your-project.supabase.co'), false);
  assert.equal(isSupabaseUrl('https://user:password@project.supabase.co'), false);
  assert.equal(isSupabaseUrl(undefined), false);
});
