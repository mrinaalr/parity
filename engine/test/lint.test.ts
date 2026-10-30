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
import { lint } from '../src/lint.js';
import { card } from './helpers.js';

const ctx = {
  name: 'alice',
  files: [{ path: 'brief.md', text: 'The stored response is returned byte for byte on a repeat with the same key, always.\nTicket ACME-INTERNAL 4471.' }],
};

test('flags an eight-word span copied from local context, by field', () => {
  const body = card();
  body.constraints = ['The stored response is returned byte for byte on a repeat with the same key.'];
  const flags = lint(body, ctx);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].field, 'constraints[0]');
  assert.equal(flags[0].source, 'brief.md');
});

test('short overlaps and evidence pointers are not flagged', () => {
  const body = card();
  body.evidence = [{ summary: 'A short note.', pointer: 'The stored response is returned byte for byte on a repeat with the same key.' }];
  assert.deepEqual(lint(body, ctx), []);
});

test('denylist hits are flagged whatever the length', () => {
  const body = card();
  body.problem = 'See acme-internal for details.';
  const flags = lint(body, ctx, ['ACME-INTERNAL']);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].source, 'denylist');
});
