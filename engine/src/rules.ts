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

// What the channel accepts. Every client re-runs these on every entry it receives,
// so a dishonest relay cannot slip an unapproved or altered entry past either party.

import { approvalHash, idOf } from './hash.js';
import { isCard, isTeachback, isTermCheck, validateEntry } from './schema.js';
import type { CardBody, Entry, TermCheckBody } from './types.js';

export function byId(log: Entry[], id: string | null): Entry | undefined {
  if (id === null) return undefined;
  return log.find((e) => e.id === id);
}

export function latestCard(log: Entry[], author: string): Entry<CardBody> | undefined {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (isCard(e) && e.author === author) return e;
  }
  return undefined;
}

/** Returns a list of broken rules; empty means the entry may be appended after `log`. */
export function verify(log: Entry[], entry: Entry): string[] {
  const out = validateEntry(entry);
  if (out.length) return out;

  if (entry.id !== idOf(entry)) out.push('id does not match the body');
  if (entry.approval.hash !== approvalHash(entry.id, entry.approval.approved_at)) out.push('approval hash does not match the id');
  if (log.some((e) => e.id === entry.id)) out.push('duplicate entry');
  if (out.length) return out;

  const target = byId(log, entry.refers);
  if (entry.refers !== null && !target) return ['refers to an entry not in the log'];

  switch (entry.kind) {
    case 'card': {
      const prev = latestCard(log, entry.author);
      if (prev && entry.refers !== prev.id) out.push("a card must refer to the author's latest card");
      if (!prev && entry.refers !== null) out.push('a first card must refer to nothing');
      if (target && (!isCard(target) || target.author !== entry.author)) out.push("a card may only refer to the author's own card");
      break;
    }
    case 'teachback': {
      if (!target || !isCard(target)) out.push('a teach-back must refer to a card');
      else if (target.author === entry.author) out.push('a party cannot teach back their own card');
      else if (log.some((e) => isTeachback(e) && e.author === entry.author && e.refers === target.id)) out.push('this party already taught back that card');
      break;
    }
    case 'grade': {
      if (!target || !isTeachback(target)) out.push('a grade must refer to a teach-back');
      else {
        const card = byId(log, target.refers);
        if (!card || card.author !== entry.author) out.push("only the card's author may grade its teach-back");
        if (log.some((e) => e.kind === 'grade' && e.refers === target.id)) out.push('that teach-back is already graded');
      }
      break;
    }
    case 'termcheck': {
      const body = entry.body as TermCheckBody;
      if (!target || !isCard(target)) out.push('a term check must refer to a card');
      else {
        if (!(body.term in target.body.key_terms)) out.push(`the card has no term "${body.term}"`);
        if (log.some((e) => isTermCheck(e) && e.author === entry.author && e.refers === target.id && e.body.term === body.term))
          out.push('this party already posted a term check for that term on that card');
      }
      break;
    }
    case 'termverdict': {
      if (!target || !isTermCheck(target)) out.push('a term verdict must refer to a term check');
      else if (target.author === entry.author) out.push('a party cannot give a verdict on their own term check');
      else if (log.some((e) => e.kind === 'termverdict' && e.author === entry.author && e.refers === target.id)) out.push('this party already gave a verdict on that term check');
      break;
    }
  }
  return out;
}

/** Verify a batch of received entries in order against a local log and append the good ones. */
export function absorb(log: Entry[], incoming: Entry[]): { accepted: Entry[]; rejected: { entry: Entry; errors: string[] }[] } {
  const accepted: Entry[] = [];
  const rejected: { entry: Entry; errors: string[] }[] = [];
  for (const e of incoming) {
    if (log.some((x) => x.id === e.id)) continue; // already have it
    const errors = verify(log, e);
    if (errors.length) rejected.push({ entry: e, errors });
    else {
      log.push(e);
      accepted.push(e);
    }
  }
  return { accepted, rejected };
}
