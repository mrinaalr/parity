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

// The protocol loop for one party. Fetch, verify, derive the next action, draft, lint, gate, append.

import type { Adapter, LocalContext } from './adapter/adapter.js';
import { blankGrade, blankVerdict } from './adapter/adapter.js';
import type { Channel } from './channel/channel.js';
import type { Gate } from './gate.js';
import { approvalHash, entryId } from './hash.js';
import { lint, type LintFlag } from './lint.js';
import { absorb } from './rules.js';
import { deriveState, describeAction, type NextAction, type State } from './state.js';
import type { CardBody, Entry, GradeBody, Kind, TermCheckBody, TermVerdictBody } from './types.js';

export interface SessionOptions {
  me: string;
  channel: Channel;
  adapter: Adapter;
  gate: Gate;
  context: () => LocalContext;
  denylist?: string[];
  /** Let the adapter draft grades and verdicts (then the gate still runs). Only for --yes and benchmarks. */
  judge?: boolean;
  /** Receives one line per event. */
  log?: (line: string) => void;
  /** Called after every change to the local log copy. */
  persist?: (log: Entry[]) => void;
  /** Initial local log copy, e.g. from .parity/log.jsonl. */
  initial?: Entry[];
  /** Ask the scheduler. Defaults to never due. */
  due?: () => boolean;
}

export interface StepResult {
  acted: Kind | null;
  state: State;
}

export class Session {
  readonly me: string;
  readonly log: Entry[];
  private lastSeq = 0;
  private readonly opts: SessionOptions;

  constructor(opts: SessionOptions) {
    this.opts = opts;
    this.me = opts.me;
    this.log = [];
    if (opts.initial?.length) {
      const { rejected } = absorb(this.log, opts.initial);
      for (const r of rejected) this.say(`dropped a stored entry: ${r.errors.join('; ')}`);
      this.lastSeq = Math.max(0, ...this.log.map((e) => e.seq ?? 0));
    }
  }

  private say(line: string): void {
    this.opts.log?.(`[${this.me}] ${line}`);
  }

  /** Pull everything new from the channel and verify it against the local copy. */
  async sync(): Promise<Entry[]> {
    const incoming = await this.opts.channel.since(this.lastSeq);
    return this.take(incoming);
  }

  /**
   * Absorb entries into the local copy. The cursor advances only over a batch fetched from the
   * channel, never over an entry we appended ourselves: the relay may have taken a partner's
   * entry just before ours, and the next fetch must still return it.
   */
  private take(incoming: Entry[], advance = true): Entry[] {
    const { accepted, rejected } = absorb(this.log, incoming);
    for (const r of rejected) this.say(`rejected an entry from the channel: ${r.errors.join('; ')}`);
    if (advance) for (const e of incoming) this.lastSeq = Math.max(this.lastSeq, e.seq ?? 0);
    if (accepted.length) {
      for (const e of accepted) if (e.author !== this.me) this.say(`received ${e.kind} from ${e.author}`);
      this.opts.persist?.(this.log);
    }
    return accepted;
  }

  state(): State {
    return deriveState(this.log, this.me, this.opts.due?.() ?? false);
  }

  /** Block until something new arrives or `ms` passes. */
  async wait(ms: number): Promise<Entry[]> {
    const incoming = await this.opts.channel.wait(this.lastSeq, ms);
    return this.take(incoming);
  }

  /** Do the one thing that is pending for this party, if any. */
  async step(force?: 'card'): Promise<StepResult> {
    await this.sync();
    let state = this.state();
    let next: NextAction = state.next;
    if (force === 'card' && next.kind === 'wait') {
      next = { kind: 'card', previous: state.latestCards[this.me], reason: 'due' };
    }
    if (next.kind === 'wait') return { acted: null, state };

    this.say(`next: ${describeAction(next)}`);
    const ctx = this.opts.context();
    let appended: Entry | null = null;

    switch (next.kind) {
      case 'card': {
        const draft = await this.opts.adapter.draftCard(ctx, next.previous?.body);
        appended = await this.submit('card', next.previous?.id ?? null, draft, ctx, { previous: next.previous?.body });
        break;
      }
      case 'teachback': {
        const draft = await this.opts.adapter.draftTeachback(next.card.body, ctx);
        appended = await this.submit('teachback', next.card.id, draft, ctx, { subject: next.card.body });
        break;
      }
      case 'grade': {
        const terms = Object.keys(next.card.body.key_terms);
        const draft: unknown =
          this.opts.judge && this.opts.adapter.judgeTeachback
            ? await this.opts.adapter.judgeTeachback(next.card.body, next.teachback.body)
            : blankGrade(terms);
        appended = await this.submit('grade', next.teachback.id, draft, ctx, {
          subject: { card: next.card.body, teachback: next.teachback.body },
          terms,
          skipLint: true,
        });
        break;
      }
      case 'termcheck': {
        const definition = next.card.body.key_terms[next.term]?.definition ?? '';
        const examples = await this.opts.adapter.draftTermCheck(next.term, definition, ctx);
        const draft: TermCheckBody = { term: next.term, ...examples };
        appended = await this.submit('termcheck', next.card.id, draft, ctx, { subject: { term: next.term, definition } });
        break;
      }
      case 'termverdict': {
        const definition = next.card.body.key_terms[next.termcheck.body.term]?.definition ?? '';
        const draft: unknown =
          this.opts.judge && this.opts.adapter.judgeTermCheck
            ? await this.opts.adapter.judgeTermCheck(definition, next.termcheck.body)
            : blankVerdict();
        appended = await this.submit('termverdict', next.termcheck.id, draft, ctx, {
          subject: { ...next.termcheck.body, definition },
          skipLint: true,
        });
        break;
      }
    }

    state = this.state();
    return { acted: appended ? appended.kind : null, state };
  }

  private async submit(
    kind: Kind,
    refers: string | null,
    draft: unknown,
    ctx: LocalContext,
    extra: { previous?: unknown; subject?: unknown; terms?: string[]; skipLint?: boolean },
  ): Promise<Entry | null> {
    const flags: LintFlag[] = extra.skipLint ? [] : lint(draft, ctx, this.opts.denylist ?? []);
    for (const f of flags) this.say(`lint: ${f.field} matches ${f.source}`);
    const approved = await this.opts.gate.approve(draft, { kind, flags, previous: extra.previous, subject: extra.subject, terms: extra.terms });
    if (!approved) {
      this.say(`${kind} rejected at the gate`);
      return null;
    }
    const id = entryId(kind, this.me, refers, approved.body);
    const entry: Entry = {
      kind,
      author: this.me,
      at: new Date().toISOString(),
      id,
      refers,
      approval: { approved_at: approved.approvedAt, open_lint_flags: approved.openFlags, hash: approvalHash(id, approved.approvedAt) },
      body: approved.body,
    };
    const stored = await this.opts.channel.append(entry);
    this.take([stored], false);
    this.say(`sent ${kind}`);
    return stored;
  }

  /**
   * Run until the pair is synced (default) or forever. Acts whenever something is pending,
   * otherwise waits on the channel.
   */
  async run(opts: { until?: 'synced' | 'forever'; waitMs?: number; maxSteps?: number; onState?: (s: State) => void } = {}): Promise<State> {
    const until = opts.until ?? 'synced';
    const waitMs = opts.waitMs ?? 20_000;
    let steps = 0;
    for (;;) {
      const { acted, state } = await this.step();
      opts.onState?.(state);
      if (acted) {
        if (++steps >= (opts.maxSteps ?? Infinity)) return state;
        continue;
      }
      if (until === 'synced' && state.status === 'synced') return state;
      await this.wait(waitMs);
    }
  }
}

export type { CardBody, GradeBody, TermCheckBody, TermVerdictBody };
