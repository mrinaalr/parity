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

import { approvalHash, entryId } from '../src/hash.js';
import type { CardBody, Entry, GradeBody, Kind } from '../src/types.js';
import { CARD_FIELDS } from '../src/types.js';

export function make<B>(kind: Kind, author: string, refers: string | null, body: B, openFlags = 0): Entry<B> {
  const id = entryId(kind, author, refers, body);
  const approved_at = new Date().toISOString();
  return {
    kind,
    author,
    at: approved_at,
    id,
    refers,
    approval: { approved_at, open_lint_flags: openFlags, hash: approvalHash(id, approved_at) },
    body,
  };
}

export function card(decision = 'Do the thing.', terms: Record<string, string> = { thing: 'The thing is the thing.' }): CardBody {
  return {
    problem: 'There is a problem.',
    decision,
    constraints: ['Stay small.'],
    acceptance: ['It works.'],
    evidence: [{ summary: 'We saw it.', pointer: 'docs/x.md' }],
    key_terms: Object.fromEntries(Object.entries(terms).map(([t, d]) => [t, { definition: d }])),
    would_change_my_mind: 'A counterexample.',
  };
}

export function grade(overall: GradeBody['overall'], terms: Record<string, GradeBody['overall']>, badFields: string[] = [], note = ''): GradeBody {
  return {
    overall,
    fields: Object.fromEntries(CARD_FIELDS.map((f) => [f, badFields.includes(f) ? 'partly' : 'right'])) as GradeBody['fields'],
    terms,
    note,
  };
}
