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

// A relay, not a database: a memory channel behind four routes and one bearer token.
// Both clients keep a full local copy of the log, so a lost relay loses nothing.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomToken } from '../hash.js';
import type { Entry } from '../types.js';
import { ChannelRejection } from './channel.js';
import { MemoryChannel } from './memory.js';

export interface RelayOptions {
  channel?: MemoryChannel;
  port?: number;
  host?: string;
  token?: string;
  /** Host name to print in the pairing code. Defaults to the LAN address, or 127.0.0.1. */
  advertise?: string;
}

export interface Relay {
  channel: MemoryChannel;
  token: string;
  port: number;
  host: string;
  url: string;
  /** `<token>@<host>:<port>` */
  code: string;
  close(): Promise<void>;
}

export const MAX_WAIT_MS = 25_000;
const MAX_BODY = 256 * 1024;

export function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

export function formatCode(token: string, host: string, port: number): string {
  return `${token}@${host}:${port}`;
}

export function parseCode(code: string): { token: string; host: string; port: number; url: string } {
  const m = /^([A-Za-z0-9_-]+)@([^:]+):(\d+)$/.exec(code.trim());
  if (!m) throw new Error('pairing code must look like <token>@<host>:<port>');
  const [, token, host, portText] = m;
  const port = Number(portText);
  return { token, host, port, url: `http://${host}:${port}` };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function startRelay(opts: RelayOptions = {}): Promise<Relay> {
  const channel = opts.channel ?? new MemoryChannel();
  const token = opts.token ?? randomToken();
  const bind = opts.host ?? '0.0.0.0';

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://relay');
      if (url.pathname === '/health') return json(res, 200, { ok: true, entries: channel.length });
      const auth = req.headers.authorization ?? '';
      if (auth !== `Bearer ${token}`) return json(res, 401, { error: 'bad token' });

      if (req.method === 'GET' && url.pathname === '/entries') {
        const since = Number(url.searchParams.get('since') ?? '0');
        return json(res, 200, await channel.since(since));
      }
      if (req.method === 'GET' && url.pathname === '/wait') {
        const since = Number(url.searchParams.get('since') ?? '0');
        const ms = Math.min(Number(url.searchParams.get('ms') ?? MAX_WAIT_MS), MAX_WAIT_MS);
        return json(res, 200, await channel.wait(since, ms));
      }
      if (req.method === 'POST' && url.pathname === '/entries') {
        let entry: Entry;
        try {
          entry = JSON.parse(await readBody(req)) as Entry;
        } catch {
          return json(res, 400, { error: 'body must be a JSON entry' });
        }
        try {
          return json(res, 201, await channel.append(entry));
        } catch (err) {
          if (err instanceof ChannelRejection) return json(res, 422, { error: 'rejected', errors: err.errors });
          throw err;
        }
      }
      return json(res, 404, { error: 'no such route' });
    } catch (err) {
      json(res, 500, { error: (err as Error).message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, bind, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : (opts.port ?? 0);
  const host = opts.advertise ?? (bind === '127.0.0.1' || bind === 'localhost' ? '127.0.0.1' : lanAddress());

  return {
    channel,
    token,
    port,
    host,
    url: `http://${host}:${port}`,
    code: formatCode(token, host, port),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections?.();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
