# Parity in Claude Code

Claude Code can give one task to a team of agents, each with its own context window. The team shares a task list, so the *work* is coordinated. Nothing checks that the two people steering it share a *reading* of the decision. Parity is that check, placed where the work splits.

## The moment

Alice and Bob are building a Delete account button. Alice's card says deleting an account removes the person's personal data *and keeps their order history*. Bob's agent restates the card and drops the second half. Alice grades the term `partly`.

Without Parity, each agent builds its own person's reading. Alice's erases names and keeps the orders. Bob's hard deletes everything. A month later finance cannot reconcile last quarter's revenue.

With Parity, the band above Bob's prompt reads

```
parity · "delete" read differently · /parity
```

and `/parity` marks the words that did not survive the restatement:

```
alice meant  Deleting an account removes the [person's personal data and keeps their order history.]
bob read     Deleting an account removes the [account.]
```

Claude knows too. Asked what delete means here, with no files read, it answers:

> "Delete" has drifted between alice's card and bob's reading. Alice meant the button removes the person's personal data (name, email, phone, addresses) and keeps their order history, but bob read it as removing the whole account. I'd build to alice's meaning, and someone should finish the Parity round to confirm it before you ship.

When Claude tries to push, the push is held:

```
Parity is holding a push: alice's card read differently on term "delete": The restatement drops that order history stays.
Synced means each person restated the other's card right. It does not mean they agree.
Finish the round with `parity` in a terminal (teach-back, grade, term check), then try again. /parity shows the drift.
```

Both quotes come from real headless runs against [`claude-code/demo-fixture/`](../claude-code/demo-fixture/).

They run a term check, Alice revises the card, and Bob restates it right. The band turns green and the push goes through. They may still disagree about the decision. Parity catches the quiet failure: one word, two meanings, and work built on both.

## What it does

| Part | What it does |
|---|---|
| Band | One line above the prompt: synced, pending, or the term that drifted. It updates within a few seconds when the partner's teach-back or grade lands. |
| `/parity` | What each author meant next to what the reader took away, word by word, plus both cards and the gate settings. |
| `/parity-status` | The same, printed in the transcript. |
| Grounding | The approved cards, and any drift, are added to Claude's system prompt and to the brief of every agent Claude spawns. |
| Teammate gate | Spawning an agent-team teammate waits until synced. Solo subagents run, carrying the grounding. |
| Handoff gate | `gh pr create`, `git push`, `gh pr merge`, and `git merge` wait until synced. |

Grounding is the part that matters most. Language models lean toward the view of whoever holds them [[1]](../README.md#ref-1). The grounding gives every agent in the session both approved readings, so no agent quietly takes its own person's side.

## Install

Tested on Claude Code 2.1.310.

```
/plugin marketplace add mrinaalr/parity
/plugin install parity@parity
```

Or, from a clone, for one session:

```bash
claude --plugin-dir /path/to/parity/claude-code
```

The mod does nothing in a folder without `.parity/`. To start a round, run `parity` in the project (see [engine/](../engine/)), share the pairing code, and approve a card.

## Try it alone

```bash
cd claude-code/demo-fixture
claude --plugin-dir ..
```

The fixture is Alice, one grade into a mismatch on `delete`. Type `/parity`. Ask Claude what delete means here. Ask it to push.

## Configure

In `.parity/config.json`, beside your name:

```json
{
  "name": "alice",
  "gateMode": "ask",
  "gateTeammates": true,
  "gateBash": true
}
```

| Field | Meaning |
|---|---|
| `gateMode` | What a held handoff does. `ask` (the default) asks you, and holds unless you choose to go ahead. `deny` always holds. `warn` shows a toast and lets it run. `off` never holds. With no one to ask, as under `claude -p`, `ask` holds. |
| `gateTeammates` | Hold agent-team teammate spawns. Default `true`. |
| `gateBash` | Hold pull requests, pushes, and merges. Default `true`. |

Before the first card nothing is held. Once `.parity/` exists, a config or log that does not parse holds every gate until it is fixed.

The gates are a guardrail for an agent working in good faith, not a sandbox. They read each shell command, ignoring quoted text, and a command built to hide a push, such as `bash -c "git push"`, gets through.

## What it reads

`.parity/config.json` and `.parity/log.jsonl`. Nothing else. The log holds only entries their authors approved before they crossed the channel, so the grounding adds no new data surface. Private notes in `.parity/context/` are never read by the mod.

## How it is built

A Claude Code mod: a manifest, a hooks module ([`hooks/register.tsx`](../claude-code/hooks/register.tsx)), and a pure log reader ([`lib/status.mjs`](../claude-code/lib/status.mjs)). The reader mirrors the engine's [`state.ts`](../engine/src/state.ts), so the mod needs no engine install to show status. A test in the engine replays a full demo round and checks the reader agrees with the engine after every entry, for both parties. The mod's own tests run under `claude plugin test claude-code`.

`parity check --json` gives the engine's view, with exit codes `0` synced, `1` not synced, `2` no config, no card, or an unreadable file. CI and git hooks can gate on it without Claude Code.

## Not yet

- Grading a teach-back from the pane. Today the round itself runs in the `parity` terminal.
- More than two people.
