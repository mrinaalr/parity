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

// Parity inside Claude Code.
//
// Reads the approved log in .parity/ and does four things with it.
// 1. Band: one line above the prompt says synced, pending, or which term drifted.
// 2. Pane: /parity shows what the author meant next to what the reader took away.
// 3. Grounding: every model call and every spawned agent reads the approved cards and any drift.
// 4. Gates: agent-team spawns, PRs, pushes, and merges wait until both sides have read each other.
//
// Reads only config.json and log.jsonl. Never reads .parity/context/. Never judges a person: it names the term or field that drifted.

import { atom, read, update } from 'claude-code';
import type { EngineInterface, Register } from 'claude-code';

import { derive, grounding, matchGatedBash, parseConfig, parseLog, wordDiff } from '../lib/status.mjs';
import type { GateMode, Snapshot } from '../types';

const PANE = 'parity';
const POLL_MS = 3000;
const PROCEED = 'Proceed anyway';
const HOLD = 'Hold';

const EMPTY: Snapshot = { reason: 'not read yet', gateMode: 'ask', gateTeammates: true, gateBash: true };
const snap = atom({ plugin: 'parity', key: 'snap' } as const, EMPTY);

const gateModeOf = (raw: unknown): GateMode =>
  raw === 'off' || raw === 'warn' || raw === 'ask' || raw === 'deny' ? raw : 'ask';

// The last folder that held .parity/, so moving into a worktree or another folder keeps the gates on.
let home = '';

async function load($: EngineInterface): Promise<Snapshot> {
  const here = ((await $.session.root()) || (await $.session.cwd())).replace(/\/$/, '');
  let root = '';
  for (const dir of home && home !== here ? [here, home] : [here]) {
    if (await $.fs.exists(`${dir}/.parity/config.json`)) {
      root = dir;
      break;
    }
  }
  if (!root) return { ...EMPTY, reason: 'no .parity/ here. Run `parity` in this folder to start a round.' };
  home = root;
  // From here on .parity/ exists, so anything unreadable holds the gates rather than opening them.
  let cfg: Record<string, unknown>;
  try {
    cfg = parseConfig(await $.fs.read(`${root}/.parity/config.json`));
  } catch {
    return { ...EMPTY, broken: true, reason: '.parity/config.json is not valid JSON' };
  }
  const gates = {
    gateMode: gateModeOf(cfg.gateMode),
    gateTeammates: cfg.gateTeammates !== false,
    gateBash: cfg.gateBash !== false,
  };
  if (typeof cfg.name !== 'string' || !cfg.name) return { ...gates, broken: true, reason: '.parity/config.json needs a name' };
  const logPath = `${root}/.parity/log.jsonl`;
  let log = '';
  try {
    if (await $.fs.exists(logPath)) log = await $.fs.read(logPath);
  } catch {
    return { ...gates, broken: true, reason: 'cannot read .parity/log.jsonl' };
  }
  try {
    return { ...gates, reason: '', state: derive(parseLog(log), cfg.name) };
  } catch {
    return { ...gates, broken: true, reason: '.parity/log.jsonl is not valid JSON lines' };
  }
}

/** Read .parity/ again, store it, and toast when the status moves. */
async function refresh($: EngineInterface): Promise<Snapshot> {
  const next = await load($);
  const prev = await read($, snap);
  if (JSON.stringify(prev) !== JSON.stringify(next)) {
    await update($, snap, () => next);
    const was = prev.state?.status;
    const now = next.state?.status;
    if (was && now && was !== now) $.ui.toast(bandText(next));
  }
  return next;
}

function bandText(s: Snapshot): string {
  const st = s.state;
  if (!st) return `parity · ${s.reason}`;
  if (st.synced) return `parity · synced with ${st.partner}`;
  if (st.status === 'mismatch') {
    const m = st.mismatches[0];
    const what = m?.terms[0] ? `"${m.terms[0]}"` : m?.fields.join(', ') || `${m?.author}'s card`;
    return `parity · ${what} read differently`;
  }
  if (st.status === 'pending') return `parity · ${st.detail}`;
  return 'parity · no card yet';
}

// Held while a round is under way and not synced, or while .parity/ exists but cannot be read.
// A folder with no .parity/, or a config with no card yet, holds nothing.
const isHeld = (s: Snapshot) =>
  s.gateMode !== 'off' && (Boolean(s.broken) || (Boolean(s.state) && !s.state!.synced && s.state!.status !== 'empty'));

/**
 * Decide a handoff. Returns the reason to refuse it, or undefined to let it run.
 * `ask` puts the choice to the person; anything but an explicit proceed holds.
 */
async function gate($: EngineInterface, s: Snapshot, what: string): Promise<string | undefined> {
  if (!isHeld(s)) return undefined;
  const why = (s.state?.detail ?? s.reason).replace(/\.$/, '');
  if (s.gateMode === 'warn') {
    $.ui.toast(`parity · ${what} while not synced`);
    return undefined;
  }
  if (s.gateMode === 'ask') {
    try {
      const pick = await $.ui.ask(`Parity is not synced: ${why}. Go ahead with ${what}?`, {
        header: 'Parity',
        options: [HOLD, PROCEED],
      });
      if (pick === PROCEED) {
        $.ui.log(`parity: ${what} went ahead while not synced, by the person's choice`);
        return undefined;
      }
    } catch {
      // dismissed, or no one to ask (claude -p): hold
    }
  }
  return [
    `Parity is holding ${what}: ${why}.`,
    'Synced means each person restated the other\'s card right. It does not mean they agree.',
    'Finish the round with `parity` in a terminal (teach-back, grade, term check), then try again. /parity shows the drift.',
  ].join('\n');
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'parity', description: 'Show the two readings and where they drift' });
    await $.command.register({ name: 'parity-status', description: 'Print Parity status in the transcript' });
    await refresh($);
    // The partner's teach-back or grade can land while nobody types; watch the log.
    $.clock.every(POLL_MS, () => void refresh($).catch(() => {}));
    return next(e);
  });

  on('command.run', { command: 'parity' }, async ($) => {
    await refresh($);
    await $.ui.open({ id: PANE, title: 'Parity', focus: true, closeOnEscape: true });
    return {};
  });

  on('command.run', { command: 'parity-status' }, async ($) => {
    const s = await refresh($);
    const lines = [bandText(s)];
    for (const m of s.state?.mismatches ?? []) {
      for (const r of m.readings) lines.push(`  ${m.author} meant: ${r.meant}`, `  ${m.reader} read:  ${r.read}`);
    }
    if (s.state && !s.state.synced) lines.push('next: finish the round with `parity` in a terminal');
    return { text: lines.join('\n') };
  });

  // Every model call carries the approved reading, so Claude does not quietly side with whoever holds it.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e);
    const s = await read($, snap);
    const text = s.state ? grounding(s.state) : '';
    if (!text) return composed;
    return { sections: [...composed.sections, { id: 'parity:grounding', text, scope: 'session' }] };
  });

  // Teammates wait for sync. Every agent that does start carries the approved reading in its brief.
  on('agent.spawn', async ($, e, next) => {
    const s = await refresh($);
    if (e.isTeammate && s.gateTeammates && !e.resume) {
      const deny = await gate($, s, `teammate "${e.name || e.subagentType}"`);
      if (deny) return { deny };
    }
    const text = s.state && !e.resume ? grounding(s.state) : '';
    return next(text ? { ...e, prompt: `${e.prompt}\n\n${text}` } : e);
  }).catch(($, e, next) =>
    // A broken gate holds only what it gates. Ordinary subagents still start.
    next.called || !e.isTeammate ? next(e) : { deny: 'parity: the teammate gate failed, so it held' },
  );

  // Bash runs the command; Monitor can too.
  on('tool.call', async ($, e, next) => {
    const command = e.tool === 'Bash' || e.tool === 'Monitor' ? e.command : undefined;
    if (!command) return next(e);
    const s = await read($, snap);
    const hit = s.gateBash ? matchGatedBash(command) : null;
    if (!hit) return next(e);
    const deny = await gate($, await refresh($), hit.label);
    return deny ? { deny } : next(e);
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `parity: the handoff gate failed, so it held` }));

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snap);
    const below = await next(e);
    if ((!s.state && !s.broken) || e.props.hasSurvey) return below;
    const { Box, Text } = $.ui.resolve(e);
    const synced = Boolean(s.state?.synced);
    const color = synced ? 'success' : s.broken || s.state?.status === 'mismatch' ? 'error' : 'warning';
    return (
      <Box flexDirection="column">
        <Text>
          <Text color={color}>{bandText(s)}</Text>
          {!synced && <Text dimColor> · /parity</Text>}
        </Text>
        {below}
      </Box>
    );
  });

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e);
    const s = await read($, snap);
    const refreshButton = <Button key="refresh" label="Refresh" hotkey="r" onPress={() => void refresh($).catch(() => {})} />;
    if (!s.state) {
      return (
        <Box flexDirection="column" rowGap={1}>
          <Text>{s.reason}</Text>
          <Text dimColor>In a terminal: `parity`, share the pairing code, approve a card. Private notes stay in .parity/context/.</Text>
          {refreshButton}
        </Box>
      );
    }
    const st = s.state;
    const color = st.synced ? 'success' : st.status === 'mismatch' ? 'error' : 'warning';
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text bold color={color}>{bandText(s)}</Text>
        <Text dimColor>
          {st.synced
            ? 'Each of you restated the other\'s card right. That is not agreement on the decision.'
            : st.status === 'mismatch'
              ? 'A restatement lost or changed something. Red is what the author meant and the reader dropped.'
              : st.detail}
        </Text>
        {st.mismatches.map((m) => {
          const fields = m.fields.filter((f) => f !== 'key_terms');
          return (
            <Box key={m.card} flexDirection="column" rowGap={1}>
              {m.readings.map((r) => {
                const runs = wordDiff(r.meant, r.read);
                return (
                  <Box key={r.term} flexDirection="column">
                    <Text bold>"{r.term}" on {m.author}'s card</Text>
                    <Text>
                      <Text dimColor>{m.author} meant  </Text>
                      {runs
                        .filter((run) => run.kind !== 'added')
                        .map((run) => (run.kind === 'dropped' ? <Text color="diffRemovedWord" bold>{run.text} </Text> : <Text>{run.text} </Text>))}
                    </Text>
                    <Text>
                      <Text dimColor>{m.reader} read   </Text>
                      {runs
                        .filter((run) => run.kind !== 'dropped')
                        .map((run) => (run.kind === 'added' ? <Text color="diffAddedWord" bold>{run.text} </Text> : <Text>{run.text} </Text>))}
                    </Text>
                  </Box>
                );
              })}
              {fields.length > 0 && <Text>{m.reader} restated {fields.join(', ')} on {m.author}'s card partly or wrong</Text>}
              {m.note && <Text dimColor>note: {m.note}</Text>}
            </Box>
          );
        })}
        {Object.entries(st.cards).map(([author, c]) => (
          <Box key={author} flexDirection="column">
            <Text bold>{author}'s card</Text>
            <Text>problem   {c.problem}</Text>
            <Text>decision  {c.decision}</Text>
            <Text dimColor>terms     {c.terms.join(', ')}</Text>
          </Box>
        ))}
        <Text dimColor>
          gates {s.gateMode} · teammates {s.gateTeammates ? 'held' : 'free'} · PR, push, merge {s.gateBash ? 'held' : 'free'}
        </Text>
        {refreshButton}
      </Box>
    );
  });
};
