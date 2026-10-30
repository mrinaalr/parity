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
