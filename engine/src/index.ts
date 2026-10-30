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

export * from './types.js';
export { canonical, sha256, entryId, approvalHash, randomToken } from './hash.js';
export { validateBody, validateEntry, validateCard, validateGrade, validateTermCheck, validateTermVerdict } from './schema.js';
export { verify, absorb, latestCard, byId } from './rules.js';
export type { Channel } from './channel/channel.js';
export { ChannelRejection } from './channel/channel.js';
export { MemoryChannel } from './channel/memory.js';
export { startRelay, parseCode, formatCode, lanAddress, type Relay, type RelayOptions } from './channel/http-server.js';
export { HttpChannel } from './channel/http-client.js';
export type { Adapter, LocalContext } from './adapter/adapter.js';
export { loadContext, blankGrade, blankVerdict } from './adapter/adapter.js';
export { ScriptedAdapter, type Script } from './adapter/scripted.js';
export { ClaudeAdapter, DEFAULT_MODEL } from './adapter/claude.js';
export { ManualAdapter } from './adapter/manual.js';
export { lint, type LintFlag, DEFAULT_MIN_WORDS } from './lint.js';
export { AutoGate, EditorGate, InlineGate, type Gate, type GateContext, type Approved } from './gate.js';
export { fidelity, termAcceptance, termMismatched, drift, fidelities, score, type Scores, TERM_MISMATCH_THRESHOLD } from './scorer.js';
export { resyncDue, expectedMisalignment, recommendedInterval, DEFAULT_SCHEDULE, type ScheduleInput } from './scheduler.js';
export { deriveState, nextAction, describeAction, parties, type State, type Status, type NextAction, type Mismatch } from './state.js';
export { checkReport, type CheckReport } from './check.js';
export { Session, type SessionOptions, type StepResult } from './session.js';
