import type { Entry } from '../types.js';

/**
 * The only thing between two parties. Append-only. Every implementation runs
 * the rules in rules.ts before accepting an entry and assigns `seq`.
 */
export interface Channel {
  append(entry: Entry): Promise<Entry>;
  /** Entries with seq greater than the argument. */
  since(seq: number): Promise<Entry[]>;
  /** Like since, but blocks up to `ms` for the first new entry. */
  wait(seq: number, ms: number): Promise<Entry[]>;
}

export class ChannelRejection extends Error {
  constructor(public readonly errors: string[]) {
    super('channel rejected entry: ' + errors.join('; '));
  }
}
