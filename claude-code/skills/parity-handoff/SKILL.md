---
name: parity-handoff
description: >-
  Use before splitting work, spawning an agent team, opening a pull request,
  pushing, or handing a decision to another person, in a project with a
  .parity/ folder. Also when the user mentions Parity, synced, teach-back, a
  drifted term, or asks whether two people are on the same page.
---

# Parity handoff

Parity checks that two people, and the agents beside them, read each other's position right. It verifies understanding. It never audits prompts and never judges a person.

The mod already puts the approved cards, and any drifted term with both readings, in your system prompt under `# Parity`. Use them.

## Before a handoff

1. Read the `# Parity` section. If there is none, the project has no round. Proceed.
2. **Synced:** proceed. Synced means each person restated the other's card right. It does not mean they agree on the decision.
3. **A term or field drifted:** do not spawn a teammate or open a pull request. Tell the user which term drifted, what the author meant, and what the reader took away. Work from the author's meaning if you must continue. Point them to `/parity`, and to `parity` in a terminal to finish the round.
4. **Pending:** say the round is not finished and wait.

If the mod holds a handoff, do not route around it with another command. The person can choose to go ahead when the mod asks.

## Never

- Ask either person to paste prompts, transcripts, or private notes. `.parity/context/` stays private.
- Treat disagreement about the decision as a failure. Disagreement is allowed. Misreading is not.
- Write a card, teach-back, or grade yourself. Each is drafted by that person's agent and approved by that person.
