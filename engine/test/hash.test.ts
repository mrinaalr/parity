import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonical, entryId, approvalHash } from '../src/hash.js';

test('canonical JSON sorts keys and drops undefined', () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 3, c: 4 }], u: undefined }), '{"a":[2,{"c":4,"d":3}],"b":1}');
});

test('entry id is stable across key order and differs by author and refers', () => {
  const a = entryId('card', 'alice', null, { x: 1, y: 2 });
  const b = entryId('card', 'alice', null, { y: 2, x: 1 });
  assert.equal(a, b);
  assert.notEqual(a, entryId('card', 'bob', null, { x: 1, y: 2 }));
  assert.notEqual(a, entryId('card', 'alice', 'f'.repeat(64), { x: 1, y: 2 }));
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('approval hash binds id and time', () => {
  const h = approvalHash('abc', '2026-10-28T00:00:00Z');
  assert.notEqual(h, approvalHash('abc', '2026-10-28T00:00:01Z'));
  assert.notEqual(h, approvalHash('abd', '2026-10-28T00:00:00Z'));
});
