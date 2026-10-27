# Evaluation design

Design only. Nothing here has been run.

The question: does the protocol detect a planted misunderstanding between two agent-assisted parties, how fast, at what false alarm rate, and at what cost in leaked private facts?

## Units

A **pair** is two simulated parties, A and B. Each party has a private context: a short brief describing a shared project, plus a set of private facts that must not appear in any card. Each party is driven by an agent adapter that drafts cards and teach-backs from the brief and a human stand-in that approves them. The human stand-in is a second model instance with a fixed approval policy, or a person, and the design records which.

A **run** is one pair carried through a fixed number of rounds of the protocol. A round is one card, one teach-back, one grade, and any term checks the grade triggers.

A **condition** is a pair type: planted or control.

## Planted misunderstandings

A planted pair starts from one shared brief, then edits B's copy so that the two parties disagree in one controlled way. Four plant types, in order of expected difficulty.

| Plant type | Edit to B's brief | Example |
|---|---|---|
| Term | One key term is given a different definition | "baseline" means the prior published model for A and the untuned current model for B |
| Scope | One boundary of the problem is moved | A excludes synthetic data from the evaluation set and B includes synthetic data |
| Claim | The central claim is weakened or strengthened | A claims the method helps on all three benchmarks and B believes the claim covers one |
| Evidence | One evidence item points at a different source | Both cite "the ablation" and mean different tables |

Each plant has a ground-truth record: the field affected, the two readings, and the term or span that carries the difference. Each plant type gets the same number of pairs. A pilot of a few pairs per type sets the brief length and the number of key terms before the main runs.

A control pair uses two identical briefs with no edit. Control pairs are generated at the same rate as planted pairs and are interleaved so the grader cannot tell the conditions apart.

## What counts as a detection

A detection is an event in the channel log, not a judgment made after the fact. A run detects the plant when, before the round limit, either of the following appears.

1. A grade of partly right or wrong on the field that carries the plant, where the author's grade note names the planted difference.
2. A term check on the planted term in which at least one of B's examples is rejected by A, or one of A's examples is rejected by B.

A grade of partly right or wrong on an unaffected field is not a detection. A grade that marks the planted field wrong for a reason unrelated to the plant is not a detection and is logged as a coincidental flag. A blind rater who sees the grade note and the ground-truth record, and not the condition label, decides each case. Two raters label every event, and disagreements are resolved by a third.

A false alarm is a grade of partly right or wrong, or a rejected term-check example, in a control run.

## Metrics

| Metric | Definition | Computed over |
|---|---|---|
| Detection rate | Fraction of planted runs with a detection before the round limit | planted runs, per plant type |
| Turns until detection | Round number of the first detection | planted runs with a detection |
| False alarm rate | Fraction of control runs with at least one false alarm | control runs |
| Leakage | Number of private facts that appear, verbatim or by a rater's judgment paraphrased, in any approved card or teach-back | all runs |

Detection rate is reported with a confidence interval and broken out by plant type. Turns until detection is reported as a distribution with the round limit as a censoring point, so runs without a detection are not dropped. Leakage is reported both as a count and as the fraction of private facts leaked, and separately for verbatim and paraphrased leaks, since the pre-send lint targets only the first.

## Conditions to vary

Each is a separate run set with everything else held fixed.

- **Card length.** The sentence limit in the schema, at three settings. Answers the README's first open question.
- **Teach-back author.** Agent versus a person, holding the card fixed. Answers the README's second open question.
- **Resync interval.** Fixed intervals of one, three, and ten rounds, plus the scheduler. Answers the README's third open question and tests whether the drift form fits.
- **Approval policy.** A stand-in that reads and edits versus a stand-in that approves everything. Measures how much of the detection rate and the leakage rate the human step carries.
- **Agent bias.** The adapter prompted to defend the party's position versus prompted to state the position plainly. Tests the sender-bias account.

## Baselines

Two comparison protocols, run on the same pairs.

- **No protocol.** The parties exchange free-text messages for the same number of rounds. A detection is any message in which a party names the planted difference, labeled by the same blind raters.
- **Card only.** Cards cross, and no teach-back or term check follows. Measures what the fixed schema alone catches.

## Outputs

For each run: the channel log, the ground-truth record, the rater labels, and the leakage count. For each run set: the four metrics with intervals, per plant type and per condition. The drift estimate from the alignment scorer is logged each round so the drift model can be fit after the fact.

## Known limits of the design

- Simulated parties share a generator, so a plant may be easier to detect than a real disagreement.
- The human stand-in's approval policy is a modeling choice, and the policy sets the leakage rate more than the protocol does.
- Raters see grade notes, so a verbose grader makes detection easier to label. Grade notes are capped at one sentence to limit this.
- Four plant types do not cover disagreements that span several fields at once.
