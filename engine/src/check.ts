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

// Machine-readable status for hooks, the Claude Code mod, and CI.

import { latestCard } from './rules.js';
import { describeAction, deriveState, type Mismatch, type State, type Status } from './state.js';
import type { CardBody, Entry } from './types.js';

export interface CheckReport {
  ok: boolean;
  synced: boolean;
  status: Status;
  detail: string;
  next: string;
  me: string;
  partner?: string;
  parties: string[];
  mismatches: Mismatch[];
  cards: Record<string, { problem: string; decision: string; terms: string[] }>;
  /** 0 synced, 1 not synced, 2 nothing to check (no config, or no card yet). */
  exitCode: number;
}

function summarizeCard(card: Entry<CardBody>): { problem: string; decision: string; terms: string[] } {
  return {
    problem: card.body.problem,
    decision: card.body.decision,
    terms: Object.keys(card.body.key_terms),
  };
}

export function checkReport(log: Entry[], me: string): CheckReport {
  const state: State = deriveState(log, me);
  const cards: CheckReport['cards'] = {};
  for (const p of state.parties) {
    const c = latestCard(log, p);
    if (c) cards[p] = summarizeCard(c);
  }
  const synced = state.status === 'synced';
  const empty = state.status === 'empty';
  const exitCode = synced ? 0 : empty ? 2 : 1;
  return {
    ok: synced,
    synced,
    status: state.status,
    detail: state.detail,
    next: describeAction(state.next),
    me: state.me,
    partner: state.partner,
    parties: state.parties,
    mismatches: state.mismatches,
    cards,
    exitCode,
  };
}
