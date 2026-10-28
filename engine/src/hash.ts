import { createHash, randomBytes } from 'node:crypto';
import type { Entry, Kind } from './types.js';

/** Deterministic JSON: object keys sorted, no whitespace. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The id of an entry: a hash over everything a human approved plus who and what it answers. */
export function entryId(kind: Kind, author: string, refers: string | null, body: unknown): string {
  return sha256(canonical({ kind, author, refers, body }));
}

export function approvalHash(id: string, approvedAt: string): string {
  return sha256(id + approvedAt);
}

export function randomToken(bytes = 9): string {
  return randomBytes(bytes).toString('base64url');
}

export function idOf(entry: Entry): string {
  return entryId(entry.kind, entry.author, entry.refers, entry.body);
}
