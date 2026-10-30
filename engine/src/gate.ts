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

// The approval gate. The only code path that turns a draft into something that may cross.
// Cards: save is approve. Grades and verdicts: no defaults, every mark must be set by hand.

import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { editInEditor } from './editor.js';
import type { LintFlag } from './lint.js';
import { validateBody } from './schema.js';
import { CARD_FIELDS, MARKS, type Kind, type Mark } from './types.js';

export interface Approved<B = unknown> {
  body: B;
  openFlags: number;
  approvedAt: string;
}

export interface GateContext {
  kind: Kind;
  flags: LintFlag[];
  /** The previous approved object of the same kind by this party, for the diff. */
  previous?: unknown;
  /** What this draft answers, shown to the human. */
  subject?: unknown;
  /** Names of terms when grading. */
  terms?: string[];
}

export interface Gate {
  readonly mode: string;
  approve<B>(draft: unknown, ctx: GateContext): Promise<Approved<B> | null>;
}

/** Approve as drafted. Only under --yes. */
export class AutoGate implements Gate {
  readonly mode = 'auto';
  async approve<B>(draft: unknown, ctx: GateContext): Promise<Approved<B> | null> {
    const errors = validateBody(ctx.kind, draft);
    if (errors.length) throw new Error(`auto gate cannot approve an invalid ${ctx.kind}: ${errors.join('; ')}`);
    return { body: draft as B, openFlags: ctx.flags.length, approvedAt: new Date().toISOString() };
  }
}

function banner(ctx: GateContext): string[] {
  const lines = [`${ctx.kind}: edit, then save to approve; save an empty file to reject`];
  for (const f of ctx.flags) lines.push(`lint: ${f.field} matches ${f.source}: "${f.span}"`);
  if (ctx.kind === 'grade' || ctx.kind === 'termverdict') lines.push('every mark is blank on purpose: fill each one by hand');
  if (ctx.subject !== undefined) {
    lines.push('--- what this answers ---');
    lines.push(...JSON.stringify(ctx.subject, null, 2).split('\n'));
  }
  return lines;
}

/** The draft opens in $EDITOR. Saving an invalid object reopens it with the errors on top. */
export class EditorGate implements Gate {
  readonly mode = 'editor';
  async approve<B>(draft: unknown, ctx: GateContext): Promise<Approved<B> | null> {
    let text = JSON.stringify(draft, null, 2);
    let head = banner(ctx);
    for (;;) {
      const saved = editInEditor(text, '.json', head);
      if (saved.trim().length === 0) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(saved);
      } catch (err) {
        head = [`not valid JSON: ${(err as Error).message}`, ...banner(ctx)];
        text = saved;
        continue;
      }
      const errors = validateBody(ctx.kind, parsed);
      if (errors.length === 0) {
        return { body: parsed as B, openFlags: ctx.flags.length, approvedAt: new Date().toISOString() };
      }
      head = [...errors.map((e) => `fix: ${e}`), ...banner(ctx)];
      text = JSON.stringify(parsed, null, 2);
    }
  }
}

/** Plain prompts in the terminal. Grades and verdicts are asked one mark at a time. */
export class InlineGate implements Gate {
  readonly mode = 'inline';
  private rl?: readline.Interface;

  private line(): readline.Interface {
    this.rl ??= readline.createInterface({ input: stdin, output: stdout });
    return this.rl;
  }

  close(): void {
    this.rl?.close();
    this.rl = undefined;
  }

  private async askMark(label: string): Promise<Mark> {
    for (;;) {
      const a = (await this.line().question(`  ${label} [r]ight / [p]artly / [w]rong: `)).trim().toLowerCase();
      const m = MARKS.find((x) => x === a || x.startsWith(a));
      if (m && a.length) return m;
    }
  }

  private async askBool(label: string): Promise<boolean> {
    for (;;) {
      const a = (await this.line().question(`  ${label} accept? [y/n]: `)).trim().toLowerCase();
      if (a === 'y' || a === 'yes') return true;
      if (a === 'n' || a === 'no') return false;
    }
  }

  async approve<B>(draft: unknown, ctx: GateContext): Promise<Approved<B> | null> {
    const out = stdout;
    out.write(`\n== ${ctx.kind} ==\n`);
    for (const f of ctx.flags) out.write(`lint: ${f.field} matches ${f.source}: "${f.span}"\n`);

    if (ctx.kind === 'grade') {
      const subject = ctx.subject as { card: unknown; teachback: unknown } | undefined;
      if (subject) {
        out.write('card:\n' + JSON.stringify(subject.card, null, 2) + '\n');
        out.write('restatement:\n' + JSON.stringify(subject.teachback, null, 2) + '\n');
      }
      out.write('Mark each field of the restatement.\n');
      const fields = {} as Record<(typeof CARD_FIELDS)[number], Mark>;
      for (const f of CARD_FIELDS) fields[f] = await this.askMark(f);
      const terms: Record<string, Mark> = {};
      for (const t of ctx.terms ?? []) terms[t] = await this.askMark(`term "${t}"`);
      const overall = await this.askMark('overall');
      const note = (await this.line().question('  note (one sentence, may be empty): ')).trim();
      const body = { overall, fields, terms, note };
      return { body: body as B, openFlags: ctx.flags.length, approvedAt: new Date().toISOString() };
    }

    if (ctx.kind === 'termverdict') {
      const check = ctx.subject as { term: string; definition: string; examples: string[]; non_examples: string[] } | undefined;
      if (check) out.write(`term "${check.term}": ${check.definition}\n`);
      const examples: boolean[] = [];
      const non_examples: boolean[] = [];
      for (let i = 0; i < 3; i++) examples.push(await this.askBool(`example ${i + 1}: ${check?.examples[i] ?? ''}`));
      for (let i = 0; i < 3; i++) non_examples.push(await this.askBool(`non-example ${i + 1}: ${check?.non_examples[i] ?? ''}`));
      const note = (await this.line().question('  note (one sentence, may be empty): ')).trim();
      return { body: { examples, non_examples, note } as B, openFlags: ctx.flags.length, approvedAt: new Date().toISOString() };
    }

    // card, teachback, termcheck: approve, edit, or reject
    let current = draft;
    for (;;) {
      out.write(JSON.stringify(current, null, 2) + '\n');
      const a = (await this.line().question('[a]pprove / [e]dit / [r]eject: ')).trim().toLowerCase();
      if (a.startsWith('r')) return null;
      if (a.startsWith('e')) {
        const edited = await new EditorGate().approve<B>(current, ctx);
        if (edited === null) return null;
        current = edited.body;
        continue;
      }
      if (a.startsWith('a')) {
        const errors = validateBody(ctx.kind, current);
        if (errors.length) {
          out.write('cannot approve:\n- ' + errors.join('\n- ') + '\n');
          continue;
        }
        return { body: current as B, openFlags: ctx.flags.length, approvedAt: new Date().toISOString() };
      }
    }
  }
}
