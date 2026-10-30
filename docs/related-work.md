# Related work

| Work | What it established | What Parity takes from it |
|---|---|---|
| Grounding in communication. Clark and Brennan, 1991 [[2]](../README.md#ref-2) | Shared understanding is built by the speakers, turn by turn, and the building has a cost | The cost becomes three fixed artifacts: a card, a teach-back, a term check |
| Teach-back in medicine. Schillinger et al., 2003 [[a]](#ref-a) | Asking a patient to restate instructions catches misunderstanding the clinician would otherwise miss | The restatement is drafted by the reader's agent and graded by the author, field by field |
| Rifts in human and LLM grounding. Shaikh et al., 2025 [[b]](#ref-b) | Models rarely start the clarifying work, and early failures to ground predict later breakdowns | The check runs before the work splits, and it runs between the people, not only between a person and a model |
| Sycophancy. Sharma et al., 2023 [[1]](../README.md#ref-1) | Models tend to agree with their user | Each agent is grounded in both approved readings, not the private view of the one at the keyboard |
| Error-detecting codes. Hamming, 1950 [[3]](../README.md#ref-3) | A small check sent beside a message reveals corruption without resending it | The name, and the shape: a short card beside the work |
| Claude Code agent teams and subagents | Many agents, separate context windows, one shared task list | Parity holds the teammate spawn until each person has restated the other's card right |
| Design docs, RFCs, ADRs | The written decision as a team's shared reference | The card is a short ADR with a receipt: proof the other side read it the way it was meant |
| MCP and agent-to-agent protocols | How agents call tools and each other | These move capability. Parity checks meaning. The two compose |

## If you already write ADRs

You have half of a card. Parity adds the other half: the reader restates it, the author grades the restatement, and a term graded partly or wrong gets three examples and three non-examples from each side until both accept them.

## If you already run agent teams

You have coordination. Parity adds the check that everyone means the same thing by the words on the task list.

## References

<a id="ref-a"></a>[a] D. Schillinger, J. Piette, K. Grumbach, et al. "Closing the Loop: Physician Communication With Diabetic Patients Who Have Low Health Literacy." *Archives of Internal Medicine* 163(1):83-90, 2003. doi:10.1001/archinte.163.1.83.

<a id="ref-b"></a>[b] O. Shaikh, H. Mozannar, G. Bansal, A. Fourney, and E. Horvitz. "Navigating Rifts in Human-LLM Grounding: Study and Benchmark." In *Proceedings of the 63rd Annual Meeting of the ACL (Volume 1: Long Papers)*, pp. 20832-20847, 2025. doi:10.18653/v1/2025.acl-long.1016.
