# Parity engine

The runnable form of the protocol in the [top-level README](../README.md). Design in [docs/engine.md](../docs/engine.md).

```bash
npm install && npm run build && npm link   # once
parity                                     # you: starts a relay, prints a pairing code
parity join <code>                         # your partner
```

Both sides draft a card, restate the other's, grade the restatement, and check any term that read differently. When every field reads right, both terminals say `synced`. Prompts, notes and context stay under `.parity/context/` on each machine. Only approved cards, restatements, grades and term checks cross.

## Try it with no key

```bash
npm run demo
```

Runs Alice and Bob from `demo/` in one process over a real HTTP relay, with scripted agents and auto-approval. Bob's restatement drops a condition from Alice's definition of `idempotent`, the grade names the term, both give examples, Alice revises, and the pair ends synced while still holding different decisions.

Two terminals, same thing:

```bash
cd demo/alice && npx tsx ../../src/cli.ts --yes --local
cd demo/bob   && npx tsx ../../src/cli.ts join <code> --yes
```

## Commands

| Command | Does |
|---|---|
| `parity` | run the relay here, print the pairing code, enter the loop |
| `parity join <code>` | join a partner's relay, enter the loop |
| `parity serve` | run only the relay |
| `parity status` | sync status and your next action, from the local log copy |
| `parity log` | the log, one line per entry |
| `parity card <code>` | draft a new card now |

Flags: `--adapter claude|scripted|manual`, `--gate editor|inline|auto`, `--yes` (auto gate, agent grades), `--port N`, `--name X`, `--local` (bind 127.0.0.1).

## How a party is set up

First run asks your name and writes `.parity/config.json`:

```json
{ "name": "alice", "adapter": "claude", "model": "claude-opus-5-5", "denylist": ["codename"], "context": ["notes/"] }
```

- **adapter** `claude` uses your own `ANTHROPIC_API_KEY`. `manual` opens a template in `$EDITOR` and you are the agent. `scripted` reads `.parity/script.json`.
- **gate** defaults to your editor when `$EDITOR` is set, else inline prompts. Cards: save is approve. Grades and term verdicts have no defaults; every mark is set by hand, and a blank one is refused.
- **across the internet**, the partner who runs `parity` needs the relay port reachable, for example through a tunnel. On one network the pairing code already carries the address.
- **denylist** strings are flagged in any draft. Any eight-word span copied verbatim from local context is flagged too. Flags are shown, never removed; the count left open is recorded with the approval.

## Library

```ts
import { Session, MemoryChannel, ScriptedAdapter, AutoGate } from 'parity-protocol';
```

`Session` runs one party over any `Channel`. `MemoryChannel` is the reference channel and the store behind the relay. `deriveState(log, me)` is a pure function from the log to sync status and next action; `score(log, author)` gives fidelity, drift and term acceptance. See `src/index.ts` for the full surface.

## Tests

```bash
npm test
```
