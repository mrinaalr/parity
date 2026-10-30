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
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { derive } from '../../claude-code/lib/status.mjs';
import { ScriptedAdapter, type Script } from '../src/adapter/scripted.js';
import { MemoryChannel } from '../src/channel/memory.js';
import { checkReport } from '../src/check.js';
import { AutoGate } from '../src/gate.js';
import { Session } from '../src/session.js';
import { deriveState } from '../src/state.js';
import type { Entry } from '../src/types.js';
import { card, grade, make } from './helpers.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const cli = join(root, 'engine/src/cli.ts');

function seq(entries: Entry[]): Entry[] {
  return entries.map((e, i) => ({ ...e, seq: i + 1 }));
}

function syncedPair(): Entry[] {
  const a = make('card', 'alice', null, card('Alice decision.', { delete: 'same key, same result.' }));
  const tb = make('teachback', 'bob', a.id, card('Alice decision.', { delete: 'same key, same result.' }));
  const g = make('grade', 'alice', tb.id, grade('right', { delete: 'right' }));
  const b = make('card', 'bob', null, card('Bob decision.', { delete: 'no second order.' }));
  const tb2 = make('teachback', 'alice', b.id, card('Bob decision.', { delete: 'no second order.' }));
  const g2 = make('grade', 'bob', tb2.id, grade('right', { delete: 'right' }));
  return seq([a, tb, g, b, tb2, g2]);
}

function mismatchPair(): Entry[] {
  const a = make('card', 'alice', null, card('Keep orders, erase personal data.', { delete: 'same key, same result.' }));
  const tb = make('teachback', 'bob', a.id, card('Keep orders, erase personal data.', { delete: 'safe to repeat at all.' }));
  const g = make('grade', 'alice', tb.id, grade('partly', { delete: 'partly' }, ['key_terms'], 'The restatement drops the same-key condition.'));
  return seq([a, tb, g]);
}

test('checkReport reports synced with exit 0', () => {
  const r = checkReport(syncedPair(), 'alice');
  assert.equal(r.synced, true);
  assert.equal(r.exitCode, 0);
  assert.ok(r.cards.alice);
});

test('checkReport reports mismatch with exit 1', () => {
  const r = checkReport(mismatchPair(), 'alice');
  assert.equal(r.status, 'mismatch');
  assert.equal(r.exitCode, 1);
  assert.ok(r.mismatches.some((m) => m.terms.includes('delete')));
});

test('claude-code status.js agrees with the engine on mismatch', () => {
  const log = mismatchPair();
  const engine = checkReport(log, 'alice');
  const mod = derive(log, 'alice');
  assert.equal(mod.status, engine.status);
  assert.equal(mod.synced, engine.synced);
  assert.ok(mod.mismatches.some((m: { terms: string[] }) => m.terms.includes('delete')));
});

test('the mod and the engine agree at every step of the demo round', { timeout: 30_000 }, async () => {
  const ch = new MemoryChannel();
  const party = (name: string) =>
    new Session({
      me: name,
      channel: ch,
      adapter: new ScriptedAdapter(JSON.parse(readFileSync(join(root, 'engine/demo', name, '.parity/script.json'), 'utf8')) as Script),
      gate: new AutoGate(),
      context: () => ({ name, files: [] }),
      judge: true,
      log: () => {},
    });
  await Promise.all([party('alice').run({ until: 'synced', waitMs: 200, maxSteps: 40 }), party('bob').run({ until: 'synced', waitMs: 200, maxSteps: 40 })]);
  const log = ch.snapshot();
  const seen = new Set<string>();
  for (let n = 0; n <= log.length; n++) {
    for (const me of ['alice', 'bob']) {
      const engine = deriveState(log.slice(0, n), me);
      const mod = derive(log.slice(0, n), me);
      assert.equal(mod.status, engine.status, `status after ${n} entries, as ${me}`);
      if (engine.status !== 'pending') assert.equal(mod.detail, engine.detail, `detail after ${n} entries, as ${me}`);
      seen.add(engine.status);
    }
  }
  assert.deepEqual([...seen].sort(), ['empty', 'mismatch', 'pending', 'synced']);
});

test('parity check CLI exits 2 with no config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'parity-check-'));
  const r = spawnSync('npx', ['tsx', cli, 'check', '--json', '--dir', dir], {
    encoding: 'utf8',
    cwd: join(root, 'engine'),
  });
  assert.equal(r.status, 2);
  const body = JSON.parse((r.stdout || '').trim() || '{}');
  assert.equal(body.exitCode, 2);
});

test('parity check CLI exits 0 on a synced fixture', () => {
  const dir = mkdtempSync(join(tmpdir(), 'parity-check-'));
  mkdirSync(join(dir, '.parity'));
  writeFileSync(join(dir, '.parity/config.json'), JSON.stringify({ name: 'alice' }));
  writeFileSync(join(dir, '.parity/log.jsonl'), syncedPair().map((e) => JSON.stringify(e)).join('\n') + '\n');
  const r = spawnSync('npx', ['tsx', cli, 'check', '--json', '--dir', dir], {
    encoding: 'utf8',
    cwd: join(root, 'engine'),
  });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.synced, true);
});
