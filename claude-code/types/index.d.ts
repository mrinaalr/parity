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

// The mod's type contract: what lib/status.mjs derives from the log, and what the mod stores.

export type Status = 'empty' | 'pending' | 'mismatch' | 'synced';

export interface Reading {
  term: string;
  /** The author's definition on the card. */
  meant: string;
  /** The reader's definition in the teach-back. */
  read: string;
}

export interface Mismatch {
  card: string;
  author: string;
  reader: string;
  fields: string[];
  terms: string[];
  note: string;
  readings: Reading[];
}

export interface CardSummary {
  problem: string;
  decision: string;
  terms: string[];
  definitions: Record<string, string>;
  would_change_my_mind: string;
}

export interface Derived {
  me: string;
  partner?: string;
  parties: string[];
  status: Status;
  detail: string;
  synced: boolean;
  mismatches: Mismatch[];
  cards: Record<string, CardSummary>;
}

export interface Run {
  kind: 'same' | 'dropped' | 'added';
  text: string;
}

export type GateMode = 'off' | 'warn' | 'ask' | 'deny';

/** What the mod last read from .parity/. `state` is absent when there is nothing to read. */
export interface Snapshot {
  /** Why there is no state, in words a person can act on. */
  reason: string;
  /** .parity/ exists but cannot be read. The gates hold. */
  broken?: boolean;
  state?: Derived;
  gateMode: GateMode;
  gateTeammates: boolean;
  gateBash: boolean;
}

declare module 'claude-code' {
  interface PluginState {
    parity: { snap: Snapshot };
  }
}
