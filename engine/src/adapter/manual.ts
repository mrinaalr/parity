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

import { editInEditor } from '../editor.js';
import { validateBody } from '../schema.js';
import type { CardBody, TermExamples } from '../types.js';
import type { Adapter, LocalContext } from './adapter.js';

const EMPTY_CARD: CardBody = {
  problem: '',
  decision: '',
  constraints: [],
  acceptance: [],
  evidence: [],
  key_terms: { term: { definition: '' } },
  would_change_my_mind: '',
};

function untilValid<T>(kind: 'card' | 'teachback' | 'termcheck', initial: unknown, banner: string[]): T {
  let text = JSON.stringify(initial, null, 2);
  for (;;) {
    const saved = editInEditor(text, '.json', banner);
    let parsed: unknown;
    try {
      parsed = JSON.parse(saved);
    } catch (err) {
      banner = [`not valid JSON: ${(err as Error).message}`, ...banner.filter((b) => !b.startsWith('not valid JSON'))];
      text = saved;
      continue;
    }
    const errors = validateBody(kind, kind === 'termcheck' ? { term: 'x', ...(parsed as object) } : parsed);
    if (errors.length === 0) return parsed as T;
    banner = [...errors.map((e) => `fix: ${e}`), ...banner.filter((b) => !b.startsWith('fix: ') && !b.startsWith('not valid JSON'))];
    text = JSON.stringify(parsed, null, 2);
  }
}

/** The human is the agent. Also the human-authored teach-back condition in the evaluation design. */
export class ManualAdapter implements Adapter {
  readonly kind = 'manual';

  async draftCard(ctx: LocalContext, previous?: CardBody): Promise<CardBody> {
    return untilValid<CardBody>('card', previous ?? EMPTY_CARD, [`${ctx.name}: write your card, save to continue`]);
  }

  async draftTeachback(card: CardBody, ctx: LocalContext): Promise<CardBody> {
    const blank: CardBody = { ...EMPTY_CARD, key_terms: Object.fromEntries(Object.keys(card.key_terms).map((t) => [t, { definition: '' }])) };
    return untilValid<CardBody>('teachback', blank, [
      `${ctx.name}: restate the card below in your own words, then delete these lines`,
      ...JSON.stringify(card, null, 2).split('\n'),
    ]);
  }

  async draftTermCheck(term: string, definition: string, ctx: LocalContext): Promise<TermExamples> {
    return untilValid<TermExamples>('termcheck', { examples: ['', '', ''], non_examples: ['', '', ''] }, [
      `${ctx.name}: three examples and three non-examples of "${term}"`,
      `definition on the card: ${definition}`,
    ]);
  }
}
