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

// Runs the two demo scripts over an in-memory channel and checks the whole round.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ScriptedAdapter, type Script } from '../src/adapter/scripted.js';
import { MemoryChannel } from '../src/channel/memory.js';
import { AutoGate } from '../src/gate.js';
import { score } from '../src/scorer.js';
import { Session } from '../src/session.js';
import { deriveState } from '../src/state.js';
import type { Entry } from '../src/types.js';
import { card, grade, make } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const script = (name: string): Script => JSON.parse(readFileSync(join(here, '..', 'demo', name, '.parity', 'script.json'), 'utf8')) as Script;

function party(name: string, channel: MemoryChannel, lines: string[]): Session {
  return new Session({
    me: name,
    channel,
    adapter: new ScriptedAdapter(script(name)),
    gate: new AutoGate(),
    context: () => ({ name, files: [] }),
    judge: true,
    log: (l) => lines.push(l),
  });
}

test('the demo pair detects the term mismatch, runs a term check, revises, and ends synced', { timeout: 30_000 }, async () => {
  const ch = new MemoryChannel();
  const lines: string[] = [];
  const alice = party('alice', ch, lines);
  const bob = party('bob', ch, lines);
  const [a, b] = await Promise.all([
    alice.run({ until: 'synced', waitMs: 200, maxSteps: 40 }),
    bob.run({ until: 'synced', waitMs: 200, maxSteps: 40 }),
  ]);
  assert.equal(a.status, 'synced', lines.join('\n'));
  assert.equal(b.status, 'synced');

  const log = ch.snapshot();
  const kinds = (author: string) => log.filter((e) => e.author === author).map((e) => e.kind);
  assert.deepEqual(kinds('alice').filter((k) => k === 'card'), ['card', 'card'], 'alice revised once');
  assert.equal(log.filter((e) => e.kind === 'termcheck').length, 2, 'both posted a term check');
  assert.equal(log.filter((e) => e.kind === 'termverdict').length, 2, 'both gave a verdict');
  assert.equal(log.filter((e) => e.kind === 'grade').length, 3, 'three grades: partly, right, right');

  // after the first grade, state was a named mismatch on the term
  const firstGrade = log.findIndex((e) => e.kind === 'grade');
  const mid = deriveState(log.slice(0, firstGrade + 1), 'alice');
  assert.equal(mid.status, 'mismatch');
  assert.match(mid.detail, /term "delete"/);

  const sa = score(log, 'alice');
  assert.equal(sa.rounds, 2);
  assert.equal(sa.latestFidelity, 1);
  assert.ok(sa.drift > 0, 'fidelity rose after the revision');
  assert.equal(sa.terms.delete.mismatched, false);
  assert.ok(sa.terms.delete.acceptance < 1);

  // the two cards still disagree on the decision, and that is allowed
  assert.notEqual(a.latestCards.alice.body.decision, a.latestCards.bob.body.decision);
});

test('a perfectly faithful pair syncs in one round with no term checks', { timeout: 30_000 }, async () => {
  const ch = new MemoryChannel();
  const mk = (name: string) =>
    new Session({
      me: name,
      channel: ch,
      adapter: new ScriptedAdapter({ cards: [card(`${name} decides.`)], teachbacks: 'echo' }),
      gate: new AutoGate(),
      context: () => ({ name, files: [] }),
      judge: true,
    });
  const [a, b] = await Promise.all([mk('a').run({ waitMs: 100, maxSteps: 10 }), mk('b').run({ waitMs: 100, maxSteps: 10 })]);
  assert.equal(a.status, 'synced');
  assert.equal(b.status, 'synced');
  assert.equal(ch.length, 6);
});

test('next action ordering from a hand-built log', () => {
  const log: Entry[] = [];
  const me = 'alice';
  assert.equal(deriveState(log, me).next.kind, 'card');
  const c = make('card', 'bob', null, card('Bob decides.'));
  log.push(c);
  assert.equal(deriveState(log, me).next.kind, 'teachback');
  const tb = make('teachback', 'alice', c.id, card('Bob decides.'));
  log.push(tb);
  assert.equal(deriveState(log, me).next.kind, 'card');
  assert.equal(deriveState(log, 'bob').next.kind, 'grade');
  const g = make('grade', 'bob', tb.id, grade('partly', { thing: 'partly' }, ['key_terms'], 'Thing is not the thing.'));
  log.push(g);
  const st = deriveState(log, me);
  assert.equal(st.status, 'mismatch');
  assert.equal(st.next.kind, 'termcheck');
  assert.equal(deriveState(log, 'bob').next.kind, 'termcheck');
});

test('a session rejects an entry the relay altered', () => {
  const c = make('card', 'bob', null, card());
  const forged: Entry = { ...c, seq: 1, body: { ...(c.body as object), decision: 'Forged.' } };
  const lines: string[] = [];
  const s = new Session({
    me: 'alice',
    channel: new MemoryChannel(),
    adapter: new ScriptedAdapter({ cards: [card()] }),
    gate: new AutoGate(),
    context: () => ({ name: 'alice', files: [] }),
    initial: [forged],
    log: (l) => lines.push(l),
  });
  assert.equal(s.log.length, 0);
  assert.ok(lines.some((l) => l.includes('dropped a stored entry')));
});
