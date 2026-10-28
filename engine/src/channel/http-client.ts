import type { Entry } from '../types.js';
import { ChannelRejection, type Channel } from './channel.js';
import { MAX_WAIT_MS, parseCode } from './http-server.js';

/** A Channel over a relay started by startRelay. Entries are re-verified by the Session, not here. */
export class HttpChannel implements Channel {
  readonly url: string;
  private readonly token: string;

  constructor(code: string) {
    const parsed = parseCode(code);
    this.url = parsed.url;
    this.token = parsed.token;
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' };
  }

  async append(entry: Entry): Promise<Entry> {
    const res = await fetch(`${this.url}/entries`, { method: 'POST', headers: this.headers(), body: JSON.stringify(entry) });
    if (res.status === 422) {
      const body = (await res.json()) as { errors?: string[] };
      throw new ChannelRejection(body.errors ?? ['rejected']);
    }
    if (!res.ok) throw new Error(`relay returned ${res.status}`);
    return (await res.json()) as Entry;
  }

  async since(seq: number): Promise<Entry[]> {
    const res = await fetch(`${this.url}/entries?since=${seq}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`relay returned ${res.status}`);
    return (await res.json()) as Entry[];
  }

  async wait(seq: number, ms: number): Promise<Entry[]> {
    const res = await fetch(`${this.url}/wait?since=${seq}&ms=${Math.min(ms, MAX_WAIT_MS)}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`relay returned ${res.status}`);
    return (await res.json()) as Entry[];
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
