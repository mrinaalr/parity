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
import { verify } from '../src/rules.js';
import { MemoryChannel } from '../src/channel/memory.js';
import { ChannelRejection } from '../src/channel/channel.js';
import type { Entry } from '../src/types.js';
import { card, grade, make } from './helpers.js';

test('a first card must refer to nothing and verifies clean', () => {
  assert.deepEqual(verify([], make('card', 'alice', null, card())), []);
  const bad = make('card', 'alice', 'a'.repeat(64), card());
  assert.ok(verify([], bad).some((e) => e.includes('not in the log')));
});

test('an altered body or approval is rejected', () => {
  const e = make('card', 'alice', null, card());
  const altered: Entry = { ...e, body: { ...(e.body as object), decision: 'Something else.' } };
  assert.ok(verify([], altered).some((m) => m.includes('id does not match')));
  const badApproval: Entry = { ...e, approval: { ...e.approval, approved_at: '2000-01-01T00:00:00Z' } };
  assert.ok(verify([], badApproval).some((m) => m.includes('approval hash')));
});

test('teach-back and grade authorship rules', () => {
  const log: Entry[] = [];
  const c = make('card', 'alice', null, card());
  log.push(c);
  assert.ok(verify(log, make('teachback', 'alice', c.id, card())).some((m) => m.includes('own card')));
  const tb = make('teachback', 'bob', c.id, card());
  assert.deepEqual(verify(log, tb), []);
  log.push(tb);
  assert.ok(verify(log, make('teachback', 'bob', c.id, card('Again.'))).some((m) => m.includes('already taught back')));
  const g = make('grade', 'bob', tb.id, grade('right', { thing: 'right' }));
  assert.ok(verify(log, g).some((m) => m.includes("card's author")));
  const ok = make('grade', 'alice', tb.id, grade('right', { thing: 'right' }));
  assert.deepEqual(verify(log, ok), []);
  log.push(ok);
  assert.ok(verify(log, make('grade', 'alice', tb.id, grade('wrong', { thing: 'wrong' }))).some((m) => m.includes('already graded')));
});

test('a second card must refer to the latest card by the same author', () => {
  const log: Entry[] = [];
  const c1 = make('card', 'alice', null, card('One.'));
  log.push(c1);
  assert.ok(verify(log, make('card', 'alice', null, card('Two.'))).some((m) => m.includes('latest card')));
  assert.deepEqual(verify(log, make('card', 'alice', c1.id, card('Two.'))), []);
  assert.ok(verify(log, make('card', 'bob', c1.id, card('Mine.'))).some((m) => m.includes('first card')));
});

test('term check needs a term the card holds; verdicts come from the other party', () => {
  const log: Entry[] = [];
  const c = make('card', 'alice', null, card());
  log.push(c);
  const tcBad = make('termcheck', 'alice', c.id, { term: 'nope', examples: ['a', 'b', 'c'], non_examples: ['d', 'e', 'f'] });
  assert.ok(verify(log, tcBad).some((m) => m.includes('no term')));
  const tc = make('termcheck', 'alice', c.id, { term: 'thing', examples: ['a', 'b', 'c'], non_examples: ['d', 'e', 'f'] });
  assert.deepEqual(verify(log, tc), []);
  log.push(tc);
  assert.ok(verify(log, make('termverdict', 'alice', tc.id, { examples: [true, true, true], non_examples: [true, true, true], note: '' })).some((m) => m.includes('own term check')));
  assert.deepEqual(verify(log, make('termverdict', 'bob', tc.id, { examples: [true, false, true], non_examples: [true, true, true], note: 'x' })), []);
});

test('the memory channel assigns seq, rejects duplicates and wakes waiters', async () => {
  const ch = new MemoryChannel();
  const c = make('card', 'alice', null, card());
  const stored = await ch.append(c);
  assert.equal(stored.seq, 1);
  await assert.rejects(ch.append(c), ChannelRejection);
  const waiting = ch.wait(1, 5000);
  const tb = make('teachback', 'bob', c.id, card());
  await ch.append(tb);
  const got = await waiting;
  assert.equal(got.length, 1);
  assert.equal(got[0].seq, 2);
  assert.deepEqual(await ch.wait(2, 10), []);
});
