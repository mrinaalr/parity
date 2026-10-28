// Shapes of everything that crosses the channel. See docs/engine.md.

export type Mark = 'right' | 'partly' | 'wrong';
export const MARKS: readonly Mark[] = ['right', 'partly', 'wrong'];

export type Kind = 'card' | 'teachback' | 'grade' | 'termcheck' | 'termverdict';
export const KINDS: readonly Kind[] = ['card', 'teachback', 'grade', 'termcheck', 'termverdict'];

export interface Evidence {
  summary: string;
  pointer: string;
}

export interface KeyTerm {
  definition: string;
  examples?: string[];
  non_examples?: string[];
}

/** The engineering card. Teach-backs reuse this shape. */
export interface CardBody {
  problem: string;
  decision: string;
  constraints: string[];
  acceptance: string[];
  evidence: Evidence[];
  key_terms: Record<string, KeyTerm>;
  would_change_my_mind: string;
}

export const CARD_FIELDS = [
  'problem',
  'decision',
  'constraints',
  'acceptance',
  'evidence',
  'key_terms',
  'would_change_my_mind',
] as const;
export type CardField = (typeof CARD_FIELDS)[number];

/** Written by a card's author about one teach-back of that card. */
export interface GradeBody {
  overall: Mark;
  fields: Record<CardField, Mark>;
  terms: Record<string, Mark>;
  note: string;
}

export interface TermExamples {
  examples: string[];
  non_examples: string[];
}

/** Three examples and three non-examples of one term on one card. */
export interface TermCheckBody extends TermExamples {
  term: string;
}

/** The other party accepts or rejects each example and non-example. */
export interface TermVerdictBody {
  examples: boolean[];
  non_examples: boolean[];
  note: string;
}

export interface Approval {
  approved_at: string;
  open_lint_flags: number;
  /** sha256 of id + approved_at */
  hash: string;
}

export interface Entry<B = unknown> {
  /** Assigned by the channel. */
  seq?: number;
  kind: Kind;
  author: string;
  at: string;
  /** sha256 of the canonical JSON of {kind, author, refers, body}. */
  id: string;
  refers: string | null;
  approval: Approval;
  body: B;
}

export type BodyFor<K extends Kind> = K extends 'card' | 'teachback'
  ? CardBody
  : K extends 'grade'
    ? GradeBody
    : K extends 'termcheck'
      ? TermCheckBody
      : TermVerdictBody;

export const SENTENCE_MAX = 300;
export const MAX_LIST = 3;
export const MIN_TERMS = 1;
export const MAX_TERMS = 5;
export const TERM_EXAMPLES = 3;
