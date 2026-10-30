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
import { ChannelRejection } from '../src/channel/channel.js';
import { HttpChannel } from '../src/channel/http-client.js';
import { formatCode, parseCode, startRelay } from '../src/channel/http-server.js';
import { card, make } from './helpers.js';

test('pairing codes round-trip', () => {
  const code = formatCode('abc_-9', '10.0.0.5', 7373);
  assert.deepEqual(parseCode(code), { token: 'abc_-9', host: '10.0.0.5', port: 7373, url: 'http://10.0.0.5:7373' });
  assert.throws(() => parseCode('nonsense'));
});

test('relay: append, since, wait, auth, and rule rejection over HTTP', async () => {
  const relay = await startRelay({ host: '127.0.0.1' });
  try {
    const client = new HttpChannel(relay.code);
    assert.equal(await client.health(), true);

    const c = make('card', 'bob', null, card());
    const stored = await client.append(c);
    assert.equal(stored.seq, 1);
    assert.equal(relay.channel.length, 1);

    const since = await client.since(0);
    assert.equal(since.length, 1);
    assert.equal(since[0].id, c.id);

    await assert.rejects(client.append(c), ChannelRejection);
    await assert.rejects(client.append(make('teachback', 'bob', c.id, card())), (err: ChannelRejection) => err.errors.some((e) => e.includes('own card')));

    const waiting = client.wait(1, 3000);
    await relay.channel.append(make('teachback', 'alice', c.id, card()));
    const got = await waiting;
    assert.equal(got.length, 1);
    assert.equal(got[0].kind, 'teachback');

    const bad = new HttpChannel(formatCode('wrong-token', '127.0.0.1', relay.port));
    await assert.rejects(bad.since(0), /401/);
  } finally {
    await relay.close();
  }
});
