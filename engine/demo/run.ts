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

// One process, two parties, one real HTTP relay. Alice hosts the relay and talks to it
// in-process; Bob joins over HTTP with the pairing code. Both are scripted, both auto-approve.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoGate, HttpChannel, ScriptedAdapter, Session, loadContext, score, startRelay } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const relay = await startRelay({ host: '127.0.0.1' });
  console.log(`relay up; pairing code ${relay.code}\n`);

  const party = (name: string, channel: Parameters<typeof Session.prototype.constructor>[0]['channel']) => {
    const dir = join(here, name);
    return new Session({
      me: name,
      channel,
      adapter: ScriptedAdapter.fromFile(join(dir, '.parity', 'script.json')),
      gate: new AutoGate(),
      context: () => loadContext(name, dir),
      denylist: name === 'alice' ? ['ACME-INTERNAL'] : [],
      judge: true,
      log: (line) => console.log(line),
    });
  };

  const alice = party('alice', relay.channel);
  const bob = party('bob', new HttpChannel(relay.code));

  const [a, b] = await Promise.all([
    alice.run({ until: 'synced', waitMs: 2000, maxSteps: 50 }),
    bob.run({ until: 'synced', waitMs: 2000, maxSteps: 50 }),
  ]);

  console.log('\n--- log ---');
  for (const e of relay.channel.snapshot()) {
    console.log(`${String(e.seq).padStart(3)}  ${e.author.padEnd(6)}  ${e.kind.padEnd(11)}  ${e.id.slice(0, 10)}  ->  ${e.refers?.slice(0, 10) ?? '-'}  flags=${e.approval.open_lint_flags}`);
  }
  console.log('\n--- state ---');
  console.log(`alice: ${a.status}  ${a.detail}`);
  console.log(`bob:   ${b.status}  ${b.detail}`);
  console.log('\n--- scores ---');
  for (const name of ['alice', 'bob']) console.log(JSON.stringify(score(relay.channel.snapshot(), name)));
  console.log('\nnote: synced means each read the other right. alice and bob still hold different decisions, and the log says so.');
  await relay.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
