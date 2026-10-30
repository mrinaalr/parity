# Engine design

The engine is the runnable form of the protocol in the README. It lives in [`engine/`](../engine/), is written in TypeScript, and has one job: let two people and their agents establish and keep parity from two terminals with nothing but a pairing code crossing between the machines before a human approves anything.

This document is the design the code follows. Where the two disagree, the code is wrong.

## Goals

1. **Two commands.** One party runs `parity`, the other runs `parity join <code>`. Everything after that is prompted.
2. **Quiet by default.** After the first sync the engine speaks only when a card arrives, a grade comes back, or a resync is due.
3. **Nothing leaves without approval.** Every object that crosses the channel carries a human approval record, and the channel rejects any object without one.
4. **Transport is a detail.** The engine talks to a `Channel` interface. The demo uses a small HTTP relay that runs inside the CLI on one partner's machine. Tests use an in-memory channel. A git-backed channel can come later without touching the protocol.
5. **The server is a relay, not a database.** Both clients keep a complete local copy of the log. A lost server loses nothing.
6. **About the problem, never about a person.** No output of the engine scores a party. Every mismatch is named by the field or term it lives in.

## Layout

```
engine/
  src/
    types.ts          entry, card, grade, term-check shapes
    hash.ts           canonical JSON and content ids
    schema.ts         validation of every body shape
    rules.ts          what the channel accepts: hashes, approvals, authorship, references
    channel/          Channel interface; memory, http-server, http-client
    adapter/          Adapter interface; claude, scripted, manual
    lint.ts           pre-send privacy lint
    gate.ts           approval gate
    scorer.ts         restatement fidelity, term acceptance, drift
    scheduler.ts      when the next card is due
    state.ts          derive pending actions and sync status from the log
    session.ts        the protocol loop for one party
    cli.ts            parity, parity join, parity serve, parity status
  demo/               two users, two directories, one planted term mismatch
  test/
```

The README's six components map onto these files directly: agent adapter to `adapter/`, approval gate to `gate.ts`, channel to `channel/`, alignment scorer to `scorer.ts`, resync scheduler to `scheduler.ts`, privacy boundary to `lint.ts` plus the rule in `session.ts` that only the adapter and the lint ever read local context.

## The engineering card

The README card is shaped for a research claim. Engineering teams hold decisions, so the engine's card renames `claim` to `decision` and adds two fields a team cannot work without. Everything else is the README schema.

```yaml
card:
  problem:              one sentence: what we are solving
  decision:             one sentence: what we are doing about it
  constraints:          up to three sentences: what must stay true
  acceptance:           up to three sentences: how we will know it worked
  evidence:             up to three items, each {summary, pointer}; a pointer is a path, commit, test, ticket, or URL
  key_terms:            one to five terms, each {definition, examples?, non_examples?}
  would_change_my_mind: one sentence
```

Two refinements of the README schema.

- **Terms carry a definition.** The README card carries only examples and non-examples per term. A one-sentence definition is what a teach-back restates, and examples are what a term check exchanges. The card may carry examples when the agent drafts them cheaply, and the human may delete them. The term check requires exactly three of each.
- **Teach-backs reuse the card shape.** The restating agent fills every field in its own words. The grade is then per field and per term, which is what makes a mismatch nameable.

Every sentence is at most 300 characters. The schema is enforced before lint, before approval, and again by the channel.

## Entries and the log

The log is an append-only sequence of entries. Five kinds.

| Kind | Author | Refers to | Body |
|---|---|---|---|
| `card` | a party | that party's previous card, or nothing | card |
| `teachback` | the other party | one card | card shape, restated |
| `grade` | the card's author | one teach-back | overall mark, mark per field, mark per term, one-sentence note |
| `termcheck` | either party | the card that holds the term | term, three examples, three non-examples |
| `termverdict` | the other party | one term check | accept or reject each example and non-example, one-sentence note |

An entry is

```json
{
  "seq": 7,
  "kind": "teachback",
  "author": "cory",
  "at": "2026-10-27T18:02:11Z",
  "id": "<sha256 of canonical {kind, author, refers, body}>",
  "refers": "<id of the entry this answers>",
  "approval": { "approved_at": "...", "open_lint_flags": 0, "hash": "<sha256 of id + approved_at>" },
  "body": { ... }
}
```

`seq` is assigned by the channel. `id` is the hash of the kind, author, reference, and body together, so an entry cannot be edited or re-addressed after approval without the channel noticing. The approval hash binds the approval to that exact body.

The channel enforces the rules in `rules.ts`, and so does every client on every entry it receives, so a dishonest relay cannot slip an unapproved or altered entry past either party.

- `id` equals the hash of `{kind, author, refers, body}`, and the approval hash equals the hash of `id` and `approved_at`.
- A `card` refers to nothing or to the author's own latest card.
- A `teachback` refers to a card by a different author, and no author teaches back the same card twice.
- A `grade` is written by the card's author and refers to a teach-back of that card.
- A `termcheck` refers to a card and names a term that card holds.
- A `termverdict` is written by someone other than the term check's author and refers to that term check.
- Marks are `right`, `partly`, or `wrong`. Notes are one sentence.

## Channels

```ts
interface Channel {
  append(entry: Entry): Promise<Entry>;          // validated, seq assigned
  since(seq: number): Promise<Entry[]>;          // entries with seq greater than the argument
  wait(seq: number, ms: number): Promise<Entry[]>; // like since, but blocks up to ms for the first new entry
}
```

**Memory.** The reference implementation. Holds the log, runs the rules, assigns sequence numbers. Used by tests, the benchmark, and the HTTP server.

**HTTP relay.** A Node HTTP server wrapping a memory channel, started by `parity` on whichever machine runs first. Four routes, all behind one bearer token.

| Route | Does |
|---|---|
| `GET /health` | liveness |
| `GET /entries?since=N` | entries after N |
| `GET /wait?since=N&ms=M` | long-poll for the first entry after N, up to M milliseconds |
| `POST /entries` | append one entry; returns it with `seq`, or a 422 naming the rule it broke |

The pairing code is `<token>@<host>:<port>`. The token is random and lives only in the two parties' memory and the code they exchanged. On one laptop the host is `127.0.0.1`. On a shared network it is the LAN address. Across the internet one party runs a tunnel, which is outside the engine. Nobody hosts anything.

**HTTP client.** Implements `Channel` over `fetch` against a relay. Re-verifies every entry it receives against the rules before trusting it.

**Git.** Not built. The design is one ref per author under `refs/parity/`, append-only, fetched on session start and on a timer. The entry format does not change.

## Adapters

The adapter is the only component that reads a party's private context. Context is the files under `.parity/context/` in the working directory plus any paths named in `.parity/config.json`. The adapter never writes to the channel.

```ts
interface Adapter {
  draftCard(ctx: LocalContext, previous?: CardBody): Promise<CardBody>;
  draftTeachback(card: CardBody, ctx: LocalContext): Promise<CardBody>;
  draftTermCheck(term: string, definition: string, ctx: LocalContext): Promise<TermExamples>;
  judgeTeachback?(card: CardBody, teachback: CardBody): Promise<GradeBody>;        // used only with --yes
  judgeTermCheck?(definition: string, check: TermExamples): Promise<TermVerdictBody>; // used only with --yes
}
```

Three implementations.

- **claude.** Calls the Claude API with the party's own key, asks for the card shape as JSON, validates, retries once on a schema failure. The two `judge` methods exist so a non-interactive run can finish a round, and are never used when a human is present.
- **scripted.** Returns canned bodies from `.parity/script.json`. Used by the demo and tests, so the protocol can be shown and checked with no model and no key.
- **manual.** Opens an empty card template in the user's editor. The human is the agent. This is also the human-authored teach-back condition in the evaluation design.

Grading and term verdicts are human acts. The `judge` methods are a convenience for demos and the benchmark, and the CLI uses them only under `--yes`.

## Lint and gate

**Lint** runs on every draft before the human sees it and marks, never removes.

- Denylist: strings from `.parity/config.json`.
- Context scan: any span of eight or more consecutive words in a draft sentence that appears verbatim in local context. Evidence pointers are exempt.

Each flag names the field, the span, and the source file. The count of flags still open at approval is recorded in the approval.

**Gate** shows the draft, the flags, and a diff against the party's previous approved object of the same kind, then takes one of three answers.

- `editor`: the draft is written to a temporary file and opened in `$EDITOR`; saving is approval, an empty file is rejection.
- `inline`: the draft is printed and the terminal asks approve, edit, or reject.
- `auto`: approve as drafted, recording the open flag count. Only under `--yes`.

Cards, teach-backs, and term checks arrive pre-filled. Grades and term verdicts arrive with every mark blank, and a blank mark fails validation, so a grade cannot be a reflexive save. Inline, each field and each term is asked one at a time. Approval fatigue is the threat model's main weakness, and this is the one place the gate pushes back.

Approval produces the `approval` record and flips nothing else. The gate is the only code path that creates an approval.

## State and the loop

`state.ts` is a pure function from the log and a party's name to two things.

**Sync status**, one of:

- `synced`: each party's latest card has a teach-back graded `right` overall with every term `right`.
- `mismatch`: some latest grade carries `partly` or `wrong`, listed by field and term.
- `pending`: something is waiting on one party, named.
- `empty`: no card yet.

**Next action** for this party, the first that applies:

1. The other party has a card I have not taught back: `teachback`.
2. Someone taught back my latest card and I have not graded it: `grade`.
3. A term on my latest card, or on the card I taught back, was graded `partly` or `wrong`, and I have not posted a term check for it on that card: `termcheck`.
4. The other party posted a term check I have not given a verdict on: `termverdict`.
5. I have no card, or the scheduler says a card is due: `card`.
6. Nothing: `wait`.

Both parties post a term check for a mismatched term and both give a verdict, so the comparison is symmetric and no party is the one being tested.

`session.ts` runs one party: fetch new entries, verify them, derive the next action, run the adapter for a draft, run lint, run the gate, append. Then wait on the channel. A card graded `partly` or `wrong` after a term check round is followed by a revised card from its author, which starts the next round, as the README protocol says.

## Scorer and scheduler

The scorer reads only the log and produces, per round, the two numbers the architecture doc defines: restatement fidelity, with `decision` and `key_terms` weighted double and a `wrong` on `decision` scoring zero; and term acceptance per term, with a mismatch below one half. Drift is the change in fidelity between consecutive rounds. Both parties run the scorer on the same log and get the same numbers.

The scheduler implements the README's drift model with the party's constants `c` and `k`, plus a fixed maximum interval. In the terminal the maximum interval is in minutes and the practical trigger is a person typing `parity card`. The Claude Code mod holds handoffs such as a pull request until synced. It does not schedule resyncs.

## CLI

```
parity                      start: run the relay, print the pairing code, enter the loop
parity join <code>          join a partner's relay, enter the loop
parity serve                run only the relay, for a machine that hosts and does not participate
parity status               print sync status and the next action
parity card <code>          draft a new card now, against the running relay
parity log                  print the log, one line per entry
```

Flags: `--adapter claude|scripted|manual`, `--gate editor|inline|auto`, `--yes` (scripted adapter if no key, auto gate, model judges), `--port`.

First run in a directory asks for a display name and writes `.parity/config.json`. The local log copy lives in `.parity/log.jsonl`.

## Demo

`engine/demo/` holds two directories, `alice` and `bob`, each a working directory with its own config, context, and script. Alice's brief and Bob's brief describe the same Delete account feature and disagree on one term: Alice's `delete` erases the person and keeps their orders, Bob's removes every row tied to the account. The scripted teach-backs are faithful, the scripted grades mark the term `partly`, and the term check surfaces the difference.

Two terminals:

```
cd engine/demo/alice && parity --yes
cd engine/demo/bob   && parity join <code> --yes
```

One process, for CI: `npm run demo` runs both sessions over a real HTTP relay inside one Node process and prints the log.

## What is not here

- The benchmark harness from [evaluation.md](evaluation.md). It will drive two `Session`s with scripted or model adapters over a memory channel and score the log. The pieces it needs exist; the plants and raters do not.
- The git channel.
- More than two parties. The rules and state are written for a pair. A hub form, where each party cards against a shared canonical card, is the planned generalization.

## Claude Code

The mod lives in [`claude-code/`](../claude-code/) and is described in [claude-code.md](claude-code.md). It does not import the engine. It reads `.parity/log.jsonl` with [`lib/status.mjs`](../claude-code/lib/status.mjs), a dependency-free reimplementation of the status logic in `state.ts`, so it works without `npm link`. `test/check.test.ts` replays the demo round and checks the copy agrees with `state.ts` after every entry. `parity check --json` gives the engine's view for CI and git hooks.
