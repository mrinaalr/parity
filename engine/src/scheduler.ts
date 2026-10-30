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

// When is the next card due? The README's drift model, as a pure function.
//
//   d_{t+1} = (1 + gamma) d_t + mu,   d_0 = 0
//   a card is due when  sum_{t=1..tau} k * d_t  >=  c,  or tau >= maxInterval.

export interface ScheduleInput {
  /** Turns (or minutes, in the CLI) since this party's last approved card. */
  turnsSinceCard: number;
  /** Reinforcement each agent adds to its own party's view per turn. */
  gamma: number;
  /** Mean noise per turn. */
  mu: number;
  /** Cost of a resync. */
  c: number;
  /** Price of a unit of misalignment per turn. */
  k: number;
  /** Hard ceiling on the interval. */
  maxInterval: number;
}

export const DEFAULT_SCHEDULE: Omit<ScheduleInput, 'turnsSinceCard'> = {
  gamma: 0.1,
  mu: 0.05,
  c: 1,
  k: 1,
  maxInterval: 60,
};

/** Expected misalignment accumulated over `turns` turns under the drift model. */
export function expectedMisalignment(turns: number, gamma: number, mu: number, k: number): number {
  let d = 0;
  let total = 0;
  for (let t = 1; t <= turns; t++) {
    d = (1 + gamma) * d + mu;
    total += k * d;
  }
  return total;
}

export function resyncDue(input: ScheduleInput): boolean {
  if (input.turnsSinceCard >= input.maxInterval) return true;
  return expectedMisalignment(input.turnsSinceCard, input.gamma, input.mu, input.k) >= input.c;
}

/** The interval the model recommends: the smallest tau at which a resync pays for itself. */
export function recommendedInterval(params: Omit<ScheduleInput, 'turnsSinceCard'>): number {
  for (let tau = 1; tau <= params.maxInterval; tau++) {
    if (expectedMisalignment(tau, params.gamma, params.mu, params.k) >= params.c) return tau;
  }
  return params.maxInterval;
}
