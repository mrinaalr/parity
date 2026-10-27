<h1 align="center">Parity</h1>

<p align="center"><em>Check that two people and their agents are on the same page, without sharing a single prompt.</em></p>

<p align="center"><img src="docs/parity.svg" width="320" alt="Two position cards joined by a wire with one parity bit between them"></p>

---

Parity does not try to audit how anyone used a model. The protocol checks whether two parties, and the agents beside them, are on the same page.

## The problem

Collaborators now read, review, and draft with language models. Three things follow.

1. **Process is invisible.** Each party credits their own model use to careful prompting and review, and discounts the other party's as unexamined output. Neither judgment can be checked from the text alone.
2. **Agents lean toward the position of whoever holds them.** Language models tend to agree with the views of their user [[1]](#ref-1), so a private view gets reinforced instead of tested.
3. **Small misunderstandings compound.** Two parties who begin one definition apart end up many turns apart, and nobody notices until the work collides.

## Principle

> Verify understanding, never process.

Shared understanding in conversation is something partners work to establish, and the work has a cost [[2]](#ref-2). Three artifacts carry that work.

| Artifact | What it is | What it catches |
|---|---|---|
| **Position card** | A short, human-approved summary of one party's claim, evidence, key terms, and what would change their mind | Hidden assumptions, unstated scope |
| **Teach-back** | The other party's agent restates the card; the author marks the restatement right, partly right, or wrong | Misreadings, early drift |
| **Term check** | For each key term, both parties give three examples and three non-examples | One word, two meanings |

The name comes from the parity check in error-detecting codes [[3]](#ref-3): a small summary sent beside a message so the receiver can detect corruption without the message being resent. The analogy is loose, and the card plays that role.

## Protocol

```
 A's agent drafts card ──► A edits and approves ──► card crosses channel
                                                          │
 B's agent restates card ◄────────────────────────────────┘
        │
        ▼
 B approves restatement ──► A grades it: right / partly / wrong
        │
        ▼
 Term check on any term graded partly or wrong ──► revised card ──► repeat
```

Cards, teach-backs, and grades are the only objects that cross the channel. Raw prompts, transcripts, and agent context stay on each party's machine.

```yaml
card:
  problem:      one sentence
  claim:        one sentence
  evidence:     up to three items, each with a pointer
  key_terms:    {term: {examples: [3], non_examples: [3]}}
  would_change_my_mind: one sentence
  status:       draft | approved
```

## An information-theoretic view

Treat the exchange as a noisy channel [[4]](#ref-4). Party $A$ encodes a position into a card $m$. Party $B$'s agent decodes the card into a restatement $\hat m$. Misreading is channel noise, and a poorly written card is encoder error.

Teach-back returns $\hat m$ to the sender, who compares the restatement with $m$. A mismatch is a detected error. The quantity to keep high is the mutual information $I(m;\hat m)$ between the card and its restatement.

Examples and non-examples repeat one meaning in several forms. Redundancy of this kind is what makes errors detectable in a code [[3]](#ref-3).

## A game-theoretic view

The protocol is a communication game, and each artifact answers a specific failure mode.

**Players and messages.** Parties $A$ and $B$ hold private understandings $\theta_A,\theta_B$. Each message is cheap talk: stating a belief costs nothing and cannot be verified directly [[5]](#ref-5).

**Sycophancy as sender bias.** An agent that leans toward its user acts like a sender with bias $b>0$. In the uniform-quadratic cheap-talk model, where the state is uniform on $[0,1]$, both players have quadratic loss, and the sender's ideal action exceeds the receiver's by $b$, the largest number of distinguishable messages in equilibrium is [[5]](#ref-5)

$$
N(b)=\left\lceil -\tfrac12+\tfrac12\sqrt{1+\tfrac{2}{b}}\,\right\rceil ,
$$

so communication coarsens as bias grows, and no informative equilibrium remains once $b\ge\tfrac14$. The card is a commitment device: a fixed schema removes the freedom to shade a message.

**Teach-back as a costly signal.** This is an analogy to costly signaling. Restating a card correctly costs $c_u$ for a party who understands the card and $c_n > c_u$ for a party who does not. When $c_n$ exceeds the benefit of being taken as an understander and $c_u$ falls below that benefit, an honest restatement separates the two types [[6]](#ref-6). Unlike cheap talk, the restatement can also be checked by the author against the card, so the claim of understanding is verified and not only asserted.

**Terms as conventions.** A shared meaning is an equilibrium of a signaling game [[7]](#ref-7). A term mismatch is miscoordination: both parties play a consistent strategy, and the strategies differ. The term check forces the convention into the open.

**Verification as a public good.** Careful reading is a collective consumption good: both parties enjoy the benefit whoever pays, and self-interested parties will understate their own demand for the good [[8]](#ref-8). Left alone, both skip the reading. The protocol lowers the cost of verifying until verifying is the cheaper move.

**Drift and the cost of resyncing.** This repository's own illustrative model, with no source. Let $d_t=\lVert\phi_A(t)-\phi_B(t)\rVert$ be the distance between the two mental models after $t$ turns. Without resync,

$$
d_{t+1}=(1+\gamma)\,d_t+\varepsilon_t ,
$$

where $\gamma\ge 0$ is the reinforcement each agent adds to its own party's view and $\varepsilon_t\ge 0$ is noise with mean $\mu>0$. A resync costs $c$ and resets $d$ to near zero. The interval $\tau$ between resyncs solves

$$
\min_{\tau}\;\; \frac{c}{\tau}+\frac{1}{\tau}\sum_{t=1}^{\tau} k\,\mathbb{E}[d_t] ,
$$

where $k$ prices a unit of misalignment. Larger $\gamma$ forces shorter intervals. The drift form is chosen for simplicity, and testing whether the form fits real exchanges is part of the project.

## Privacy model

1. **Local by default.** Prompts, transcripts, and agent context never leave the originating machine.
2. **Human in the loop.** An agent drafts a card, and the human edits and approves the card before anything is sent.
3. **Minimal surface.** The card schema is fixed and short, which bounds what can leak.

Residual risks: an approved card may reveal more than intended, and an agent summary may quietly soften or distort a position. The human approval step exists for both.

## Where it applies

- **Research collaboration.** Two authors confirm they hold the same problem statement before dividing the work.
- **Peer review.** A reviewer's agent restates a paper's claim, the author confirms or corrects the restatement, and the review proceeds from a shared reading. The reviewer can ask "is this what you mean?" and get an answer in one round.
- **Advising and mentoring.** A student and advisor check, at fixed intervals, that both still describe the project the same way.

The protocol also works one-sided: a party can send a card to someone who is not using Parity and read their plain-text reaction as the teach-back.

## Evaluation sketch

Generate pairs of agent-assisted parties with a planted misunderstanding, then measure four quantities. [docs/evaluation.md](docs/evaluation.md) expands this sketch into an experiment design.

1. Detection rate of the planted misunderstanding.
2. Turns until detection.
3. False alarm rate on pairs with no planted difference.
4. Information leaked through approved cards, scored against a held-out set of private facts.

## Open questions

- How short can a card be before the card stops catching drift?
- Does teach-back from an agent carry the same signal as teach-back from a human?
- What resync interval do real collaborations need, and does $\gamma$ differ across models?
- How should the protocol treat a party who refuses to approve any card?

## Status

Sketch only. This repository holds the protocol, the model, and the privacy design, with no implementation yet. [docs/architecture.md](docs/architecture.md) describes the components and data flow. References support individual statements. This sketch makes no claim of novelty and no comparison to other work.

## License

Apache-2.0

## References

<a id="ref-1"></a>[1] M. Sharma, M. Tong, T. Korbak, et al. "Towards Understanding Sycophancy in Language Models." arXiv:2310.13548, 2023.

<a id="ref-2"></a>[2] H. H. Clark and S. E. Brennan. "Grounding in Communication." In L. B. Resnick, J. M. Levine, and S. D. Teasley (eds.), *Perspectives on Socially Shared Cognition*, American Psychological Association, 1991, pp. 127-149. doi:10.1037/10096-006.

<a id="ref-3"></a>[3] R. W. Hamming. "Error Detecting and Error Correcting Codes." *Bell System Technical Journal* 29(2):147-160, 1950. doi:10.1002/j.1538-7305.1950.tb00463.x.

<a id="ref-4"></a>[4] C. E. Shannon. "A Mathematical Theory of Communication." *Bell System Technical Journal* 27(3):379-423 and 27(4):623-656, 1948. doi:10.1002/j.1538-7305.1948.tb01338.x and 10.1002/j.1538-7305.1948.tb00917.x.

<a id="ref-5"></a>[5] V. P. Crawford and J. Sobel. "Strategic Information Transmission." *Econometrica* 50(6):1431-1451, 1982. doi:10.2307/1913390.

<a id="ref-6"></a>[6] M. Spence. "Job Market Signaling." *Quarterly Journal of Economics* 87(3):355-374, 1973. doi:10.2307/1882010.

<a id="ref-7"></a>[7] D. Lewis. *Convention: A Philosophical Study*. Harvard University Press, 1969.

<a id="ref-8"></a>[8] P. A. Samuelson. "The Pure Theory of Public Expenditure." *Review of Economics and Statistics* 36(4):387-389, 1954. doi:10.2307/1925895.
