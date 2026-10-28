import { readFileSync } from 'node:fs';
import type { CardBody, GradeBody, TermExamples, TermVerdictBody } from '../types.js';
import { CARD_FIELDS } from '../types.js';
import type { Adapter, LocalContext } from './adapter.js';

/**
 * Canned drafts from a JSON file, so the protocol can be shown and tested with no model and no key.
 * Lists are consumed in order; the last item repeats once the list runs out.
 */
export interface Script {
  cards: CardBody[];
  /** "echo" restates the received card word for word. */
  teachbacks?: CardBody[] | 'echo';
  termchecks?: Record<string, TermExamples>;
  grades?: GradeBody[];
  termverdicts?: TermVerdictBody[];
}

function take<T>(list: T[] | undefined, cursor: { i: number }, what: string): T {
  if (!list || list.length === 0) throw new Error(`script has no ${what}`);
  const item = list[Math.min(cursor.i, list.length - 1)];
  cursor.i++;
  return item;
}

export class ScriptedAdapter implements Adapter {
  readonly kind = 'scripted';
  private cursors = { cards: { i: 0 }, teachbacks: { i: 0 }, grades: { i: 0 }, termverdicts: { i: 0 } };

  constructor(private readonly script: Script) {}

  static fromFile(path: string): ScriptedAdapter {
    return new ScriptedAdapter(JSON.parse(readFileSync(path, 'utf8')) as Script);
  }

  async draftCard(_ctx: LocalContext, _previous?: CardBody): Promise<CardBody> {
    return structuredClone(take(this.script.cards, this.cursors.cards, 'cards'));
  }

  async draftTeachback(card: CardBody, _ctx: LocalContext): Promise<CardBody> {
    const tb = this.script.teachbacks ?? 'echo';
    if (tb === 'echo') return structuredClone(card);
    return structuredClone(take(tb, this.cursors.teachbacks, 'teachbacks'));
  }

  async draftTermCheck(term: string, _definition: string, _ctx: LocalContext): Promise<TermExamples> {
    const tc = this.script.termchecks?.[term];
    if (!tc) throw new Error(`script has no termcheck for "${term}"`);
    return structuredClone(tc);
  }

  async judgeTeachback(_card: CardBody, _teachback: CardBody): Promise<GradeBody> {
    if (this.script.grades?.length) return structuredClone(take(this.script.grades, this.cursors.grades, 'grades'));
    return {
      overall: 'right',
      fields: Object.fromEntries(CARD_FIELDS.map((f) => [f, 'right'])) as GradeBody['fields'],
      terms: Object.fromEntries(Object.keys(_card.key_terms).map((t) => [t, 'right'])),
      note: '',
    };
  }

  async judgeTermCheck(_definition: string, _check: TermExamples): Promise<TermVerdictBody> {
    if (this.script.termverdicts?.length) return structuredClone(take(this.script.termverdicts, this.cursors.termverdicts, 'termverdicts'));
    return { examples: [true, true, true], non_examples: [true, true, true], note: '' };
  }
}
