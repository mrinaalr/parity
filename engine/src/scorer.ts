// Reads only the log. Both parties run it and get the same numbers.

import { isCard, isGrade, isTeachback, isTermVerdict } from './schema.js';
import { CARD_FIELDS, type CardField, type Entry, type GradeBody, type Mark, type TermVerdictBody } from './types.js';

const WEIGHT: Record<CardField, number> = {
  problem: 1,
  decision: 2,
  constraints: 1,
  acceptance: 1,
  evidence: 1,
  key_terms: 2,
  would_change_my_mind: 1,
};

const VALUE: Record<Mark, number> = { right: 1, partly: 0.5, wrong: 0 };

export const TERM_MISMATCH_THRESHOLD = 0.5;

/** Weighted fraction of fields graded right. A wrong decision scores zero. */
export function fidelity(grade: GradeBody): number {
  if (grade.fields.decision === 'wrong') return 0;
  let num = 0;
  let den = 0;
  for (const f of CARD_FIELDS) {
    num += WEIGHT[f] * VALUE[grade.fields[f]];
    den += WEIGHT[f];
  }
  return num / den;
}

/** Fraction of a term check's examples and non-examples the other party accepted. */
export function termAcceptance(verdict: TermVerdictBody): number {
  const all = [...verdict.examples, ...verdict.non_examples];
  return all.filter(Boolean).length / all.length;
}

export function termMismatched(verdict: TermVerdictBody): boolean {
  return termAcceptance(verdict) < TERM_MISMATCH_THRESHOLD;
}

/** Fidelity of each graded teach-back of `author`'s cards, in log order. */
export function fidelities(log: Entry[], author: string): number[] {
  const out: number[] = [];
  for (const g of log) {
    if (!isGrade(g) || g.author !== author) continue;
    const tb = log.find((e) => e.id === g.refers);
    if (!tb || !isTeachback(tb)) continue;
    const card = log.find((e) => e.id === tb.refers);
    if (!card || !isCard(card) || card.author !== author) continue;
    out.push(fidelity(g.body));
  }
  return out;
}

/** Change in fidelity between the last two graded rounds; zero with fewer than two. */
export function drift(log: Entry[], author: string): number {
  const f = fidelities(log, author);
  if (f.length < 2) return 0;
  return f[f.length - 1] - f[f.length - 2];
}

export interface Scores {
  author: string;
  rounds: number;
  latestFidelity: number | null;
  drift: number;
  terms: Record<string, { acceptance: number; mismatched: boolean }>;
}

export function score(log: Entry[], author: string): Scores {
  const f = fidelities(log, author);
  const terms: Scores['terms'] = {};
  for (const v of log) {
    if (!isTermVerdict(v)) continue;
    const check = log.find((e) => e.id === v.refers);
    if (!check || check.kind !== 'termcheck' || check.author !== author) continue;
    const term = (check.body as { term: string }).term;
    terms[term] = { acceptance: termAcceptance(v.body), mismatched: termMismatched(v.body) };
  }
  return { author, rounds: f.length, latestFidelity: f.length ? f[f.length - 1] : null, drift: drift(log, author), terms };
}
