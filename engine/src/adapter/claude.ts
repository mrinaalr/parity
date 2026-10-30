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

import Anthropic from '@anthropic-ai/sdk';
import { validateBody } from '../schema.js';
import type { CardBody, GradeBody, Kind, TermExamples, TermVerdictBody } from '../types.js';
import { CARD_FIELDS, MAX_LIST, MAX_TERMS, SENTENCE_MAX, TERM_EXAMPLES } from '../types.js';
import type { Adapter, LocalContext } from './adapter.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';

const CARD_SHAPE = `{
  "problem": "one sentence: what we are solving",
  "decision": "one sentence: what we are doing about it",
  "constraints": ["up to ${MAX_LIST} sentences: what must stay true"],
  "acceptance": ["up to ${MAX_LIST} sentences: how we will know it worked"],
  "evidence": [{"summary": "one sentence", "pointer": "file path, commit, test, ticket, or URL"}],
  "key_terms": {"term": {"definition": "one sentence"}},
  "would_change_my_mind": "one sentence"
}`;

const RULES = `Every sentence is at most ${SENTENCE_MAX} characters. evidence has at most ${MAX_LIST} items. key_terms has 1 to ${MAX_TERMS} terms. Reply with the JSON object only: no prose, no code fences.`;

function contextBlock(ctx: LocalContext): string {
  if (ctx.files.length === 0) return '(no local context files)';
  return ctx.files.map((f) => `--- ${f.path} ---\n${f.text}`).join('\n\n');
}

/** Drafts with the party's own key. Grading methods exist for --yes runs only. */
export class ClaudeAdapter implements Adapter {
  readonly kind = 'claude';
  private readonly client: Anthropic;

  constructor(private readonly model: string = DEFAULT_MODEL, client?: Anthropic) {
    this.client = client ?? new Anthropic();
  }

  private async askJson<T>(kind: Kind | 'termexamples', system: string, user: string): Promise<T> {
    let prompt = user;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8000,
        system,
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.stop_reason === 'refusal') throw new Error('the model declined this request');
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        prompt = `${user}\n\nYour previous reply was not valid JSON. Reply with the JSON object only.`;
        continue;
      }
      const errors = kind === 'termexamples' ? validateBody('termcheck', { term: 'x', ...(parsed as object) }) : validateBody(kind, parsed);
      if (errors.length === 0) return parsed as T;
      prompt = `${user}\n\nYour previous reply broke these rules:\n- ${errors.join('\n- ')}\nReply with a corrected JSON object only.`;
    }
    throw new Error('the model did not produce a valid object after two attempts');
  }

  async draftCard(ctx: LocalContext, previous?: CardBody): Promise<CardBody> {
    const system = `You draft a Parity position card for ${ctx.name}, an engineer. A card states the position ${ctx.name} actually holds, drawn only from the local context given. State it plainly; do not defend it. Shape:\n${CARD_SHAPE}\n${RULES}`;
    const user = `Local context:\n\n${contextBlock(ctx)}\n\n${previous ? `Previous approved card (revise it where the context has moved on):\n${JSON.stringify(previous, null, 2)}\n\n` : ''}Draft the card.`;
    return this.askJson<CardBody>('card', system, user);
  }

  async draftTeachback(card: CardBody, ctx: LocalContext): Promise<CardBody> {
    const system = `You restate another engineer's Parity card in ${ctx.name}'s own words, so the author can check whether ${ctx.name} read it right. Keep the meaning, change the wording, and do not add, soften, or argue. Use the same shape:\n${CARD_SHAPE}\n${RULES}`;
    const user = `The card to restate:\n${JSON.stringify(card, null, 2)}\n\n${ctx.name}'s local context, for vocabulary only:\n\n${contextBlock(ctx)}\n\nRestate the card.`;
    return this.askJson<CardBody>('teachback', system, user);
  }

  async draftTermCheck(term: string, definition: string, ctx: LocalContext): Promise<TermExamples> {
    const system = `You give ${TERM_EXAMPLES} concrete examples and ${TERM_EXAMPLES} concrete non-examples of a term as ${ctx.name} uses it, drawn from ${ctx.name}'s local context. Each is one sentence describing a specific situation. Shape: {"examples": ["...", "...", "..."], "non_examples": ["...", "...", "..."]}\n${RULES}`;
    const user = `Term: ${term}\nDefinition on the card: ${definition}\n\nLocal context:\n\n${contextBlock(ctx)}\n\nGive the examples and non-examples.`;
    return this.askJson<TermExamples>('termexamples', system, user);
  }

  async judgeTeachback(card: CardBody, teachback: CardBody): Promise<GradeBody> {
    const system = `You grade how faithfully a restatement reproduces a card, field by field. Marks are "right", "partly", or "wrong". Grade meaning, not wording. Shape: {"overall": mark, "fields": {${CARD_FIELDS.map((f) => `"${f}": mark`).join(', ')}}, "terms": {"<each key term on the card>": mark}, "note": "one sentence naming the most important difference, or empty"}\nReply with the JSON object only.`;
    const user = `Card:\n${JSON.stringify(card, null, 2)}\n\nRestatement:\n${JSON.stringify(teachback, null, 2)}`;
    return this.askJson<GradeBody>('grade', system, user);
  }

  async judgeTermCheck(definition: string, check: TermExamples): Promise<TermVerdictBody> {
    const system = `You decide, for each example and non-example, whether it fits a definition. Shape: {"examples": [bool, bool, bool], "non_examples": [bool, bool, bool], "note": "one sentence on the first rejection, or empty"}\nReply with the JSON object only.`;
    const user = `Definition: ${definition}\n\nExamples:\n${check.examples.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\nNon-examples:\n${check.non_examples.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;
    return this.askJson<TermVerdictBody>('termverdict', system, user);
  }
}
