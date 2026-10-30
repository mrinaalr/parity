# Parity for Claude Code

The Claude Code mod for [Parity](../README.md). It shows whether two people and their agents read each other right, puts the approved reading in front of every agent, and holds handoffs until both sides have read each other.

```
/plugin marketplace add mrinaalr/parity
/plugin install parity@parity
```

Or for one session from a clone: `claude --plugin-dir path/to/parity/claude-code`.

| | |
|---|---|
| Band | `parity · synced with bob`, or the term that drifted |
| `/parity` | What was meant next to what was read, word by word |
| `/parity-status` | The same, in the transcript |
| Grounding | Approved cards and any drift, in Claude's system prompt and every spawned agent's brief |
| Gates | Teammate spawns, `gh pr create`, `git push`, merges. `gateMode`: `ask`, `deny`, `warn`, `off` |

Try it with no partner: `cd demo-fixture && claude --plugin-dir ..`, then `/parity`.

Tests: `claude plugin test .` from this folder. Full write-up: [docs/claude-code.md](../docs/claude-code.md).
