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

// Pre-send privacy lint. Marks, never removes.

import type { LocalContext } from './adapter/adapter.js';

export interface LintFlag {
  field: string;
  span: string;
  /** 'denylist' or the context file the span was found in */
  source: string;
}

export const DEFAULT_MIN_WORDS = 8;

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Walk every string in a body with its path, skipping evidence pointers. */
function strings(value: unknown, path: string, out: Array<{ path: string; text: string }>): void {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (path.startsWith('evidence') && k === 'pointer') continue;
      strings(v, path ? `${path}.${k}` : k, out);
    }
  }
}

export function lint(body: unknown, ctx: LocalContext, denylist: string[] = [], minWords = DEFAULT_MIN_WORDS): LintFlag[] {
  const flags: LintFlag[] = [];
  const fields: Array<{ path: string; text: string }> = [];
  strings(body, '', fields);
  const normalizedFiles = ctx.files.map((f) => ({ path: f.path, text: normalize(f.text) }));
  const deny = denylist.map(normalize).filter(Boolean);

  for (const { path, text } of fields) {
    const lowered = normalize(text);
    for (const d of deny) {
      if (lowered.includes(d)) flags.push({ field: path, span: d, source: 'denylist' });
    }
    const words = lowered.split(' ');
    if (words.length < minWords) continue;
    let hit = false;
    for (let i = 0; i + minWords <= words.length && !hit; i++) {
      const span = words.slice(i, i + minWords).join(' ');
      for (const f of normalizedFiles) {
        if (f.text.includes(span)) {
          flags.push({ field: path, span, source: f.path });
          hit = true;
          break;
        }
      }
    }
  }
  return flags;
}
