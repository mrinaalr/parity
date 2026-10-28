import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CardBody, GradeBody, TermExamples, TermVerdictBody } from '../types.js';

/** Everything an adapter may read. Never leaves the machine. */
export interface LocalContext {
  name: string;
  files: Array<{ path: string; text: string }>;
}

/**
 * The only component that reads private context. Never writes to the channel.
 * `judge*` exist so a non-interactive run can finish a round; the CLI uses them only under --yes.
 */
export interface Adapter {
  readonly kind: string;
  draftCard(ctx: LocalContext, previous?: CardBody): Promise<CardBody>;
  draftTeachback(card: CardBody, ctx: LocalContext): Promise<CardBody>;
  draftTermCheck(term: string, definition: string, ctx: LocalContext): Promise<TermExamples>;
  judgeTeachback?(card: CardBody, teachback: CardBody): Promise<GradeBody>;
  judgeTermCheck?(definition: string, check: TermExamples): Promise<TermVerdictBody>;
}

const MAX_FILE = 200 * 1024;
const TEXT_EXT = /\.(md|txt|json|ya?ml|ts|js|py|rs|go|java|kt|rb|toml|cfg|ini|csv|sql|sh|html|css)$/i;

function walk(root: string, dir: string, out: LocalContext['files']): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names.sort()) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(root, full, out);
    else if (st.isFile() && st.size <= MAX_FILE && TEXT_EXT.test(name)) {
      out.push({ path: relative(root, full), text: readFileSync(full, 'utf8') });
    }
  }
}

/** Reads `.parity/context/` under `dir` plus any extra paths. */
export function loadContext(name: string, dir: string, extra: string[] = []): LocalContext {
  const files: LocalContext['files'] = [];
  walk(dir, join(dir, '.parity', 'context'), files);
  for (const p of extra) {
    const full = join(dir, p);
    try {
      const st = statSync(full);
      if (st.isDirectory()) walk(dir, full, files);
      else if (st.size <= MAX_FILE) files.push({ path: p, text: readFileSync(full, 'utf8') });
    } catch {
      /* missing extra path: skip */
    }
  }
  return { name, files };
}

/** A grade with every mark blank. Validation rejects it until a human fills every field. */
export function blankGrade(terms: string[]): Record<string, unknown> {
  return {
    overall: '',
    fields: Object.fromEntries(['problem', 'decision', 'constraints', 'acceptance', 'evidence', 'key_terms', 'would_change_my_mind'].map((f) => [f, ''])),
    terms: Object.fromEntries(terms.map((t) => [t, ''])),
    note: '',
  };
}

/** A verdict with every answer blank, for the same reason. */
export function blankVerdict(): Record<string, unknown> {
  return { examples: [null, null, null], non_examples: [null, null, null], note: '' };
}
