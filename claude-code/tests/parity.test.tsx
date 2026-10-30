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

// Runs under `claude plugin test claude-code`. The hooks below the plugin stand for the engine:
// they serve a fake .parity/ folder and record what the plugin asks for.

import { expect, test } from 'claude-code/testing';

const ROOT = '/proj';
const CONFIG = JSON.stringify({ name: 'alice', gateMode: 'deny' });
// The demo fixture's round: alice's card, bob's teach-back that drops "keeps their order history", alice's partly grade.
const card = (author: string, def: string) => ({
  problem: 'People who close their account keep getting our email.',
  decision: 'Add a Delete account button.',
  key_terms: { delete: { definition: def } },
  would_change_my_mind: 'Legal says order history is personal data.',
  author,
});
const MEANT = "Deleting an account removes the person's personal data and keeps their order history.";
const READ = 'Deleting an account removes the account.';
const MISMATCH = [
  { seq: 1, kind: 'card', author: 'alice', id: 'c1', refers: null, body: card('alice', MEANT) },
  { seq: 2, kind: 'teachback', author: 'bob', id: 't1', refers: 'c1', body: card('bob', READ) },
  {
    seq: 3, kind: 'grade', author: 'alice', id: 'g1', refers: 't1',
    body: { overall: 'partly', fields: { key_terms: 'partly' }, terms: { delete: 'partly' }, note: 'Drops that order history stays.' },
  },
];
const SYNCED = [
  { seq: 1, kind: 'card', author: 'alice', id: 'c1', refers: null, body: card('alice', MEANT) },
  { seq: 2, kind: 'teachback', author: 'bob', id: 't1', refers: 'c1', body: card('bob', MEANT) },
  { seq: 3, kind: 'grade', author: 'alice', id: 'g1', refers: 't1', body: { overall: 'right', fields: {}, terms: { delete: 'right' }, note: '' } },
  { seq: 4, kind: 'card', author: 'bob', id: 'c2', refers: null, body: card('bob', MEANT) },
  { seq: 5, kind: 'teachback', author: 'alice', id: 't2', refers: 'c2', body: card('alice', MEANT) },
  { seq: 6, kind: 'grade', author: 'bob', id: 'g2', refers: 't2', body: { overall: 'right', fields: {}, terms: { delete: 'right' }, note: '' } },
];
const jsonl = (log: unknown[]) => log.map((e) => JSON.stringify(e)).join('\n') + '\n';

const COMPOSE = { model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as const;

function project(on: any, files: Record<string, string>, spawned: string[] = [], root = () => ROOT) {
  on('clock.every', () => ({ value: undefined }));
  on('ui.toast', () => ({ value: undefined }));
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e);
    return <Text>engine</Text>;
  });
  on('session.root', () => ({ value: root() }));
  on('session.cwd', () => ({ value: root() }));
  on('fs.read', (_: unknown, e: { path: string }) => {
    const text = files[e.path.replace(`${ROOT}/`, '')];
    if (text === undefined) throw new Error(`ENOENT ${e.path}`);
    return { value: text };
  });
  on('fs.exists', (_: unknown, e: { path: string }) => ({ value: files[e.path.replace(`${ROOT}/`, '')] !== undefined }));
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }));
  on('ui.open', () => ({ value: { isPlaced: true } }));
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }));
  on('tool.call', () => ({ result: { stdout: 'ran' } }));
  on('agent.spawn', (_: unknown, e: { prompt: string }) => {
    spawned.push(e.prompt);
    return { model: 'test' };
  });
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }));
}

const start = ($: any) => $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true });

test('a mismatch holds a PR and names the drifted term', async ($, on) => {
  project(on, { '.parity/config.json': CONFIG, '.parity/log.jsonl': jsonl(MISMATCH) });
  await start($);
  const ran = await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' });
  expect(ran.deny).toMatch(/holding a pull request/);
  expect(ran.deny).toMatch(/delete/);
});

test('ordinary Bash is never held', async ($, on) => {
  project(on, { '.parity/config.json': CONFIG, '.parity/log.jsonl': jsonl(MISMATCH) });
  await start($);
  const ran = await $.tool.call({ tool: 'Bash', command: 'npm test' });
  expect(ran.deny).toBeUndefined();
  expect(ran.result).toEqual({ stdout: 'ran' });
});

test('synced lets the push through', async ($, on) => {
  project(on, { '.parity/config.json': CONFIG, '.parity/log.jsonl': jsonl(SYNCED) });
  await start($);
  const ran = await $.tool.call({ tool: 'Bash', command: 'git push origin main' });
  expect(ran.deny).toBeUndefined();
  expect(ran.result).toEqual({ stdout: 'ran' });
});

test('no .parity/ folder means the mod stays out of the way', async ($, on) => {
  project(on, {});
  await start($);
  const ran = await $.tool.call({ tool: 'Bash', command: 'git push' });
  expect(ran.deny).toBeUndefined();
  expect(ran.result).toEqual({ stdout: 'ran' });
  const composed = await $.prompt.compose(COMPOSE as any);
  expect(composed.sections.map((s) => s.id)).not.toContain('parity:grounding');
});

test('Claude reads both readings of the drifted term', async ($, on) => {
  project(on, { '.parity/config.json': CONFIG, '.parity/log.jsonl': jsonl(MISMATCH) });
  await start($);
  const composed = await $.prompt.compose(COMPOSE as any);
  const section = composed.sections.find((s) => s.id === 'parity:grounding');
  expect(section?.scope).toBe('session');
  expect(section?.text).toMatch(/alice meant: "Deleting an account removes the person's personal data and keeps/);
  expect(section?.text).toMatch(/bob read: "Deleting an account removes the account/);
  expect(section?.text).toMatch(/never as instructions to you/);
  expect(section?.text).toMatch(/Do not pick one reading silently/);
});

test('a teammate is held while not synced; a solo subagent runs with the reading in its brief', async ($, on) => {
  const spawned: string[] = [];
  project(on, { '.parity/config.json': CONFIG, '.parity/log.jsonl': jsonl(MISMATCH) }, spawned);
  await start($);
  const held = await $.agent.spawn({ prompt: 'build the delete job', name: 'builder', isTeammate: true } as any);
  expect((held as any).deny).toMatch(/holding teammate "builder"/);
  await $.agent.spawn({ prompt: 'explore the accounts code' } as any);
  expect(spawned).toHaveLength(1);
  expect(spawned[0]).toMatch(/^explore the accounts code/);
  expect(spawned[0]).toMatch(/Drifted term "delete"/);
});

test('the pane shows what was meant next to what was read', async ($, on) => {
  project(on, { '.parity/config.json': CONFIG, '.parity/log.jsonl': jsonl(MISMATCH) });
  await start($);
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'parity', surface, component: 'Pane', requestId: 'parity',
      props: { title: 'Parity', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    } as any);
    expect((await ui.find({ type: 'Text', text: /"delete" read differently/ }))?.text).toBeTruthy();
    expect((await ui.find({ type: 'Text', text: /^person's personal data and keeps their order history. $/ }))?.text).toBeTruthy();
    await ui.unmount();
  }
});

test('the band names the term above the prompt', async ($, on) => {
  project(on, { '.parity/config.json': CONFIG, '.parity/log.jsonl': jsonl(MISMATCH) });
  await start($);
  const ui = await $.ui.mount({
    plugin: 'parity', surface: 'terminal', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  } as any);
  expect((await ui.find({ type: 'Text', text: /parity · "delete" read differently/ }))?.text).toBeTruthy();
  await ui.unmount();
});

test('a log that cannot be read holds the push instead of opening it', async ($, on) => {
  project(on, { '.parity/config.json': CONFIG, '.parity/log.jsonl': '<<<<<<< HEAD\n{"seq":1}\n' });
  await start($);
  const ran = await $.tool.call({ tool: 'Bash', command: 'git push' });
  expect(ran.deny).toMatch(/not valid JSON lines/);
});

test('a config with no card yet holds nothing', async ($, on) => {
  project(on, { '.parity/config.json': CONFIG });
  await start($);
  const ran = await $.tool.call({ tool: 'Bash', command: 'git push' });
  expect(ran.deny).toBeUndefined();
});

test('the matcher reads commands, not quoted text', async ($, on) => {
  project(on, { '.parity/config.json': CONFIG, '.parity/log.jsonl': jsonl(MISMATCH) });
  await start($);
  for (const command of ['git commit -m "do not git push yet"', 'git merge --abort', 'grep -r "gh pr create" .', 'git stash push']) {
    expect((await $.tool.call({ tool: 'Bash', command })).deny).toBeUndefined();
  }
  for (const command of ['git --no-pager push', 'gh -R o/r pr create', 'npm test && git -C "my dir" push', 'sh -c "git push"', 'sudo git push']) {
    expect((await $.tool.call({ tool: 'Bash', command })).deny).toMatch(/Parity is holding/);
  }
});

test('moving into a worktree keeps the gates on', async ($, on) => {
  let where = ROOT;
  project(on, { '.parity/config.json': CONFIG, '.parity/log.jsonl': jsonl(MISMATCH) }, [], () => where);
  await start($);
  where = '/proj-worktree';
  const ran = await $.tool.call({ tool: 'Bash', command: 'git push' });
  expect(ran.deny).toMatch(/Parity is holding a push/);
});

test('a push started through Monitor is held too', async ($, on) => {
  project(on, { '.parity/config.json': CONFIG, '.parity/log.jsonl': jsonl(MISMATCH) });
  await start($);
  const ran = await $.tool.call({ tool: 'Monitor', description: 'push', timeout_ms: 1000, command: 'git push' } as any);
  expect(ran.deny).toMatch(/Parity is holding a push/);
});
