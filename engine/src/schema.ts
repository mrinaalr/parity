import {
  CARD_FIELDS,
  KINDS,
  MARKS,
  MAX_LIST,
  MAX_TERMS,
  MIN_TERMS,
  SENTENCE_MAX,
  TERM_EXAMPLES,
  type CardBody,
  type Entry,
  type GradeBody,
  type Kind,
  type TermCheckBody,
  type TermVerdictBody,
} from './types.js';

type Errors = string[];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function sentence(v: unknown, path: string, out: Errors, allowEmpty = false): void {
  if (typeof v !== 'string') return void out.push(`${path}: must be a string`);
  if (!allowEmpty && v.trim().length === 0) out.push(`${path}: must not be empty`);
  if (v.length > SENTENCE_MAX) out.push(`${path}: longer than ${SENTENCE_MAX} characters`);
}

function sentenceList(v: unknown, path: string, out: Errors, min: number, max: number): void {
  if (!Array.isArray(v)) return void out.push(`${path}: must be a list`);
  if (v.length < min) out.push(`${path}: needs at least ${min}`);
  if (v.length > max) out.push(`${path}: more than ${max}`);
  v.forEach((s, i) => sentence(s, `${path}[${i}]`, out));
}

function mark(v: unknown, path: string, out: Errors): void {
  if (!MARKS.includes(v as never)) out.push(`${path}: must be one of ${MARKS.join(', ')}`);
}

export function validateCard(v: unknown): Errors {
  const out: Errors = [];
  if (!isObj(v)) return ['card: must be an object'];
  for (const k of Object.keys(v)) if (!(CARD_FIELDS as readonly string[]).includes(k)) out.push(`card.${k}: unknown field`);
  sentence(v.problem, 'problem', out);
  sentence(v.decision, 'decision', out);
  sentenceList(v.constraints, 'constraints', out, 0, MAX_LIST);
  sentenceList(v.acceptance, 'acceptance', out, 0, MAX_LIST);
  if (!Array.isArray(v.evidence)) out.push('evidence: must be a list');
  else {
    if (v.evidence.length > MAX_LIST) out.push(`evidence: more than ${MAX_LIST}`);
    v.evidence.forEach((e, i) => {
      if (!isObj(e)) return void out.push(`evidence[${i}]: must be an object`);
      sentence(e.summary, `evidence[${i}].summary`, out);
      if (typeof e.pointer !== 'string' || e.pointer.length === 0) out.push(`evidence[${i}].pointer: must be a non-empty string`);
    });
  }
  if (!isObj(v.key_terms)) out.push('key_terms: must be an object');
  else {
    const terms = Object.keys(v.key_terms);
    if (terms.length < MIN_TERMS) out.push(`key_terms: needs at least ${MIN_TERMS} term`);
    if (terms.length > MAX_TERMS) out.push(`key_terms: more than ${MAX_TERMS} terms`);
    for (const t of terms) {
      const kt = v.key_terms[t];
      if (t.trim().length === 0) out.push('key_terms: empty term name');
      if (!isObj(kt)) {
        out.push(`key_terms.${t}: must be an object`);
        continue;
      }
      sentence(kt.definition, `key_terms.${t}.definition`, out);
      if (kt.examples !== undefined) sentenceList(kt.examples, `key_terms.${t}.examples`, out, TERM_EXAMPLES, TERM_EXAMPLES);
      if (kt.non_examples !== undefined) sentenceList(kt.non_examples, `key_terms.${t}.non_examples`, out, TERM_EXAMPLES, TERM_EXAMPLES);
    }
  }
  sentence(v.would_change_my_mind, 'would_change_my_mind', out);
  return out;
}

export function validateGrade(v: unknown): Errors {
  const out: Errors = [];
  if (!isObj(v)) return ['grade: must be an object'];
  mark(v.overall, 'overall', out);
  if (!isObj(v.fields)) out.push('fields: must be an object');
  else for (const f of CARD_FIELDS) mark(v.fields[f], `fields.${f}`, out);
  if (!isObj(v.terms)) out.push('terms: must be an object');
  else for (const t of Object.keys(v.terms)) mark(v.terms[t], `terms.${t}`, out);
  sentence(v.note, 'note', out, true);
  return out;
}

export function validateTermCheck(v: unknown): Errors {
  const out: Errors = [];
  if (!isObj(v)) return ['termcheck: must be an object'];
  if (typeof v.term !== 'string' || v.term.trim().length === 0) out.push('term: must be a non-empty string');
  sentenceList(v.examples, 'examples', out, TERM_EXAMPLES, TERM_EXAMPLES);
  sentenceList(v.non_examples, 'non_examples', out, TERM_EXAMPLES, TERM_EXAMPLES);
  return out;
}

export function validateTermVerdict(v: unknown): Errors {
  const out: Errors = [];
  if (!isObj(v)) return ['termverdict: must be an object'];
  for (const k of ['examples', 'non_examples'] as const) {
    const a = v[k];
    if (!Array.isArray(a) || a.length !== TERM_EXAMPLES) out.push(`${k}: must be a list of ${TERM_EXAMPLES}`);
    else a.forEach((b, i) => { if (typeof b !== 'boolean') out.push(`${k}[${i}]: must be true or false`); });
  }
  sentence(v.note, 'note', out, true);
  return out;
}

export function validateBody(kind: Kind, body: unknown): Errors {
  switch (kind) {
    case 'card':
    case 'teachback':
      return validateCard(body);
    case 'grade':
      return validateGrade(body);
    case 'termcheck':
      return validateTermCheck(body);
    case 'termverdict':
      return validateTermVerdict(body);
  }
}

const HEX64 = /^[0-9a-f]{64}$/;

export function validateEntry(e: unknown): Errors {
  const out: Errors = [];
  if (!isObj(e)) return ['entry: must be an object'];
  if (!KINDS.includes(e.kind as never)) out.push(`kind: must be one of ${KINDS.join(', ')}`);
  if (typeof e.author !== 'string' || e.author.trim().length === 0) out.push('author: must be a non-empty string');
  if (typeof e.at !== 'string' || Number.isNaN(Date.parse(e.at))) out.push('at: must be an ISO date-time');
  if (typeof e.id !== 'string' || !HEX64.test(e.id)) out.push('id: must be a sha256 hex string');
  if (e.refers !== null && (typeof e.refers !== 'string' || !HEX64.test(e.refers))) out.push('refers: must be null or a sha256 hex string');
  if (e.seq !== undefined && (typeof e.seq !== 'number' || !Number.isInteger(e.seq) || e.seq < 1)) out.push('seq: must be a positive integer');
  if (!isObj(e.approval)) out.push('approval: missing');
  else {
    const a = e.approval;
    if (typeof a.approved_at !== 'string' || Number.isNaN(Date.parse(a.approved_at))) out.push('approval.approved_at: must be an ISO date-time');
    if (typeof a.open_lint_flags !== 'number' || a.open_lint_flags < 0) out.push('approval.open_lint_flags: must be a non-negative number');
    if (typeof a.hash !== 'string' || !HEX64.test(a.hash)) out.push('approval.hash: must be a sha256 hex string');
  }
  if (KINDS.includes(e.kind as never)) out.push(...validateBody(e.kind as Kind, e.body));
  return out;
}

export function isCard(e: Entry): e is Entry<CardBody> {
  return e.kind === 'card';
}
export function isTeachback(e: Entry): e is Entry<CardBody> {
  return e.kind === 'teachback';
}
export function isGrade(e: Entry): e is Entry<GradeBody> {
  return e.kind === 'grade';
}
export function isTermCheck(e: Entry): e is Entry<TermCheckBody> {
  return e.kind === 'termcheck';
}
export function isTermVerdict(e: Entry): e is Entry<TermVerdictBody> {
  return e.kind === 'termverdict';
}
