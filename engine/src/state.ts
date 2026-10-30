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

// A pure function from the log and a party's name to sync status and next action.

import { byId, latestCard } from './rules.js';
import { isCard, isGrade, isTeachback, isTermCheck, isTermVerdict } from './schema.js';
import type { CardBody, Entry, GradeBody, TermCheckBody } from './types.js';

export type Status = 'empty' | 'pending' | 'mismatch' | 'synced';

export type NextAction =
  | { kind: 'card'; previous?: Entry<CardBody>; reason: 'first' | 'revision' | 'due' }
  | { kind: 'teachback'; card: Entry<CardBody> }
  | { kind: 'grade'; teachback: Entry<CardBody>; card: Entry<CardBody> }
  | { kind: 'termcheck'; card: Entry<CardBody>; term: string }
  | { kind: 'termverdict'; termcheck: Entry<TermCheckBody>; card: Entry<CardBody> }
  | { kind: 'wait' };

export interface Mismatch {
  card: string;
  author: string;
  fields: string[];
  terms: string[];
  note: string;
}

export interface State {
  me: string;
  partner?: string;
  parties: string[];
  status: Status;
  /** One line a human can read. */
  detail: string;
  next: NextAction;
  mismatches: Mismatch[];
  latestCards: Record<string, Entry<CardBody>>;
}

export function parties(log: Entry[], me: string): string[] {
  const set = new Set<string>([me]);
  for (const e of log) set.add(e.author);
  return [...set];
}

function teachbackOf(log: Entry[], cardId: string, author: string): Entry<CardBody> | undefined {
  return log.find((e): e is Entry<CardBody> => isTeachback(e) && e.refers === cardId && e.author === author);
}

function gradeOf(log: Entry[], teachbackId: string): Entry<GradeBody> | undefined {
  return log.find((e): e is Entry<GradeBody> => isGrade(e) && e.refers === teachbackId);
}

function termcheckOf(log: Entry[], cardId: string, term: string, author: string): Entry<TermCheckBody> | undefined {
  return log.find((e): e is Entry<TermCheckBody> => isTermCheck(e) && e.refers === cardId && e.author === author && e.body.term === term);
}

function verdictOf(log: Entry[], termcheckId: string, author: string): Entry | undefined {
  return log.find((e) => isTermVerdict(e) && e.refers === termcheckId && e.author === author);
}

function badTerms(grade: GradeBody): string[] {
  return Object.entries(grade.terms)
    .filter(([, m]) => m !== 'right')
    .map(([t]) => t);
}

function badFields(grade: GradeBody): string[] {
  return Object.entries(grade.fields)
    .filter(([, m]) => m !== 'right')
    .map(([f]) => f);
}

function allRight(grade: GradeBody): boolean {
  return grade.overall === 'right' && badFields(grade).length === 0 && badTerms(grade).length === 0;
}

/** The grade on `partner`'s teach-back of `card`, if both exist. */
function roundGrade(log: Entry[], card: Entry<CardBody>, partner: string): Entry<GradeBody> | undefined {
  const tb = teachbackOf(log, card.id, partner);
  return tb ? gradeOf(log, tb.id) : undefined;
}

/** True once both parties posted a term check for `term` on `card` and both gave a verdict. */
function termRoundComplete(log: Entry[], card: Entry<CardBody>, term: string, a: string, b: string): boolean {
  const ca = termcheckOf(log, card.id, term, a);
  const cb = termcheckOf(log, card.id, term, b);
  if (!ca || !cb) return false;
  return Boolean(verdictOf(log, ca.id, b) && verdictOf(log, cb.id, a));
}

export function nextAction(log: Entry[], me: string, partner: string | undefined, due = false): NextAction {
  const mine = latestCard(log, me);
  const theirs = partner ? latestCard(log, partner) : undefined;

  // 1. their latest card, not yet taught back by me
  if (theirs && !teachbackOf(log, theirs.id, me)) return { kind: 'teachback', card: theirs };

  // 2. a teach-back of my latest card I have not graded
  if (mine && partner) {
    const tb = teachbackOf(log, mine.id, partner);
    if (tb && !gradeOf(log, tb.id)) return { kind: 'grade', teachback: tb, card: mine };
  }

  // 3. a term graded partly or wrong on my card or on the card I taught back, with no term check from me
  if (partner) {
    for (const card of [mine, theirs]) {
      if (!card) continue;
      const g = roundGrade(log, card, card.author === me ? partner : me);
      if (!g) continue;
      for (const term of badTerms(g.body)) {
        if (!termcheckOf(log, card.id, term, me)) return { kind: 'termcheck', card, term };
      }
    }
  }

  // 4. their term check with no verdict from me
  if (partner) {
    for (const e of log) {
      if (!isTermCheck(e) || e.author !== partner) continue;
      if (verdictOf(log, e.id, me)) continue;
      const card = byId(log, e.refers);
      if (card && isCard(card)) return { kind: 'termverdict', termcheck: e, card };
    }
  }

  // 5. no card yet, a revision owed after a term round, or the scheduler says due
  if (!mine) return { kind: 'card', reason: 'first' };
  if (partner) {
    const g = roundGrade(log, mine, partner);
    if (g && !allRight(g.body)) {
      const terms = badTerms(g.body);
      const complete = terms.every((t) => termRoundComplete(log, mine, t, me, partner));
      if (complete) return { kind: 'card', previous: mine, reason: 'revision' };
    }
  }
  if (due) return { kind: 'card', previous: mine, reason: 'due' };

  return { kind: 'wait' };
}

export function deriveState(log: Entry[], me: string, due = false): State {
  const all = parties(log, me);
  const partner = all.find((p) => p !== me);
  const latestCards: Record<string, Entry<CardBody>> = {};
  for (const p of all) {
    const c = latestCard(log, p);
    if (c) latestCards[p] = c;
  }
  const next = nextAction(log, me, partner, due);
  const mismatches: Mismatch[] = [];

  if (Object.keys(latestCards).length === 0) {
    return { me, partner, parties: all, status: 'empty', detail: 'no card yet', next, mismatches, latestCards };
  }

  let graded = 0;
  for (const [author, card] of Object.entries(latestCards)) {
    const other = all.find((p) => p !== author);
    if (!other) continue;
    const g = roundGrade(log, card, other);
    if (!g) continue;
    graded++;
    if (!allRight(g.body)) {
      mismatches.push({ card: card.id, author, fields: badFields(g.body), terms: badTerms(g.body), note: g.body.note });
    }
  }

  if (mismatches.length) {
    const detail = mismatches
      .map((m) => {
        const parts = [...m.terms.map((t) => `term "${t}"`), ...m.fields.filter((f) => f !== 'key_terms' || m.terms.length === 0)];
        return `${m.author}'s card read differently on ${parts.join(', ')}${m.note ? `: ${m.note}` : ''}`;
      })
      .join('; ');
    return { me, partner, parties: all, status: 'mismatch', detail, next, mismatches, latestCards };
  }

  if (partner && graded === 2 && Object.keys(latestCards).length === 2) {
    return { me, partner, parties: all, status: 'synced', detail: `${me} and ${partner} read each other's cards right`, next, mismatches, latestCards };
  }

  const waitingOn = partner ? describeWaiting(log, me, partner) : `waiting for a partner to join`;
  return { me, partner, parties: all, status: 'pending', detail: waitingOn, next, mismatches, latestCards };
}

function describeWaiting(log: Entry[], me: string, partner: string): string {
  const mineNext = nextAction(log, me, partner);
  if (mineNext.kind !== 'wait') return `your move: ${describeAction(mineNext)}`;
  const theirs = nextAction(log, partner, me);
  if (theirs.kind !== 'wait') return `waiting on ${partner} to ${describeAction(theirs, 'their')}`;
  return 'waiting';
}

export function describeAction(a: NextAction, whose: 'your' | 'their' = 'your'): string {
  switch (a.kind) {
    case 'card':
      return a.reason === 'first' ? `write ${whose} first card` : a.reason === 'revision' ? `revise ${whose} card` : 'write a fresh card';
    case 'teachback':
      return `restate ${a.card.author}'s card`;
    case 'grade':
      return `grade ${a.teachback.author}'s restatement`;
    case 'termcheck':
      return `give examples of "${a.term}"`;
    case 'termverdict':
      return `judge ${a.termcheck.author}'s examples of "${a.termcheck.body.term}"`;
    case 'wait':
      return 'wait';
  }
}
