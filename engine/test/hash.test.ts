/*
 * Copyright 2026 Mrinaal Ramachandran
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
