import type { Entry } from '../types.js';
import { verify } from '../rules.js';
import { ChannelRejection, type Channel } from './channel.js';

/** The reference channel. Also the store behind the HTTP relay. */
export class MemoryChannel implements Channel {
  private log: Entry[] = [];
  private waiters: Array<() => void> = [];

  constructor(initial: Entry[] = []) {
    for (const e of initial) {
      const errors = verify(this.log, e);
      if (errors.length) throw new ChannelRejection(errors);
      this.log.push({ ...e, seq: this.log.length + 1 });
    }
  }

  async append(entry: Entry): Promise<Entry> {
    const errors = verify(this.log, entry);
    if (errors.length) throw new ChannelRejection(errors);
    const stored: Entry = { ...entry, seq: this.log.length + 1 };
    this.log.push(stored);
    const w = this.waiters;
    this.waiters = [];
    for (const wake of w) wake();
    return stored;
  }

  async since(seq: number): Promise<Entry[]> {
    return this.log.filter((e) => (e.seq ?? 0) > seq);
  }

  async wait(seq: number, ms: number): Promise<Entry[]> {
    const now = await this.since(seq);
    if (now.length) return now;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== wake);
        resolve();
      }, ms);
      const wake = () => {
        clearTimeout(timer);
        resolve();
      };
      this.waiters.push(wake);
    });
    return this.since(seq);
  }

  get length(): number {
    return this.log.length;
  }

  snapshot(): Entry[] {
    return [...this.log];
  }
}
