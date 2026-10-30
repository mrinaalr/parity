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

// Types for status.mjs, the pure log reader the hooks module and the engine tests share.

import type { Derived, Run } from '../types/index.d.ts';

export function derive(log: unknown[], me: string): Derived;
export function grounding(state: Derived): string;
export function wordDiff(meant: string, read: string): Run[];
export function parseLog(text: string): unknown[];
export function parseConfig(text: string): Record<string, unknown>;
export function matchGatedBash(command: string): { id: 'pr' | 'push' | 'merge'; label: string } | null;
