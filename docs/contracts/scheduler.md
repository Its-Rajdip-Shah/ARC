# Scheduler Contract — Frozen Rules and Precedents

## Status

This document is normative for the current ARC scheduler integration. How that integration currently behaves is described in [`docs/guides/scheduler.md`](../guides/scheduler.md). The guide does not override this contract.

Any future scheduler engine, algorithm, flavour, refactor, optimization, AI layer, or UI integration **must preserve these rules unless the contract itself is explicitly reviewed and versioned**.

Current public boundary:

- Engine: `c11.15.9`
- Input contract: `1`
- Output contract: `1`
- Flavours: `lock-in`, `monk`

## 1. Authority boundary

### ARC owns canonical truth

The scheduler MUST NOT mutate or redefine:

- task hierarchy;
- explicit dependency graph;
- canonical priority;
- release/start dates;
- deadlines/due dates;
- `manual_requested_date` anchor intent;
- completion truth;
- `percent_completed`;
- confirmed `ProgressSegment` history;
- semantic task identity/decomposition.

### Scheduler owns disposable proposal state

The scheduler MAY freely replace:

- `PlanningItem.scheduled_date`;
- `PlanningItem.execution_rank`;
- `SchedulerAllocation` rows;
- serialized `SchedulingState.scheduler_runtime`;
- scheduler diagnostics/load/objective metadata.

These values are proposals/derived projections, never canonical facts.

## 2. Scheduler failure safety

A scheduler failure MUST NOT partially corrupt canonical state.

Applying a successful output must be atomic.

If output validation fails, ARC must reject the proposal rather than partially persist it.

## 3. Input purity

Scheduler input must be built from already reconciled ARC state.

The scheduler must not silently repair invalid canonical state, manufacture missing dependencies, rewrite dates, or infer new user intent.

Garbage canonical state must be fixed by the domain layer, not hidden by scheduling logic.

## 4. Candidate semantics

Scheduler-visible work must represent executable/actionable frontier work.

- completed/deleted work is excluded;
- structural items with unfinished visible children are not ordinary executable leaves;
- residual parent work may be represented only according to frozen residual semantics;
- a dependent may be included with its unfinished prerequisite when both are schedulable;
- if a prerequisite cannot itself be represented/scheduled, its dependent remains outside the schedulable frontier.

## 5. Dependency contract

Dependencies are hard completion precedence.

For `A -> B`:

```text
A must complete before B begins.
```

No flavour, priority, deadline pressure, overload permission, or Timeline gesture may silently violate the dependency.

Urgency may propagate backward from B to A so the scheduler can protect B's deadline/anchor.

Unrelated work may still coexist in free capacity. Dependencies do not imply global serialization of the entire calendar.

## 6. Release contract

Release/start date is hard scheduler legality.

Automatic scheduling cannot place work before its release.

The system cannot silently move a release earlier to make a plan convenient.

If the user explicitly requests an anchor before release, ARC must surface an explicit resolution choice rather than rewriting the date automatically.

## 7. Deadline contract

Deadline is canonical completion boundary.

The scheduler cannot silently move/extend a deadline.

Deadline urgency is derived from remaining work, capacity, constraints and time; it is not equivalent to priority.

Actual lateness dominates comfort in the production objective.

If overload is required to avoid avoidable lateness, overload is preferable to deliberately scheduling the work late merely for smoothness.

## 8. Priority contract

Priority means user importance/preference, not dependency precedence.

Priority may affect scheduling but can be overridden by:

- hard dependencies;
- release legality;
- anchors;
- immediate deadline feasibility;
- physical infeasibility.

The scheduler must not manufacture a priority value for unpositioned tasks.

## 9. Anchor/manual intent contract

`manual_requested_date` is canonical explicit human date intent.

Automatic scheduling must treat valid active anchors as sticky intent according to the public engine contract.

Passing/expiring an anchor does not make it a deadline.

Anchor expiry and deadline overdue are different concepts.

Removing an anchor explicitly returns placement authority to automatic scheduling.

## 10. Overload contract

Capacity comfort is soft; physical time is real.

The scheduler may exceed flavour preferred/soft load when deadline/anchor pressure requires it.

Explicit `SchedulingOverload` permission is an ARC input signal and must remain visible to the algorithm/integration.

Valid but overloaded plans must remain representable.

A physically impossible day (`>24h`) must be reported honestly as infeasible rather than hidden through impossible scheduling.

## 11. Work conservation

Every scheduler run must conserve remaining work exactly.

For each task:

```text
remaining_fraction = max(0, 100 - percent_completed) / 100
expected allocation percentage = remaining_fraction × 100
```

The sum of returned allocation percentages for the task MUST exactly equal the expected percentage.

No proposal may create or destroy work mass.

## 12. Atomic vs splittable work

Atomic work remains one scheduling unit/day according to the frozen engine's bucket semantics.

Splittable work may be distributed across dates without creating semantic task children.

`SchedulerAllocation` rows are visual/planning proposal sessions only.

They must never become hierarchy nodes or dependency identities.

## 13. Confirmed progress contract

Confirmed progress is canonical.

Future scheduler proposals cannot masquerade as progress.

`SchedulerAllocation` is disposable.

`ProgressSegment` is durable confirmed history.

Rescheduling may freely change future allocations but must preserve confirmed progress.

Reversing a completed progress segment is a local explicit domain operation and must not silently discard unrelated confirmed progress.

## 14. Completion/reopen contract

Completing work may trigger scheduling reconciliation, but the scheduler does not decide whether the task is canonically complete.

For splittable work, reopening must respect the frozen progress-segment inverse semantics rather than bypassing confirmed-progress invariants.

`completed_display_date` is presentation history only and must never become scheduler input or canonical date intent.

## 15. Flavour contract

Changing flavour may change proposal state but MUST NOT change canonical facts or hard legality.

Both Lock-in and Monk share:

- releases;
- dependencies;
- anchors;
- work conservation;
- validator;
- canonical authority boundary.

They differ only in human scheduling policy.

Current policy values are frozen until explicitly versioned.

## 16. Objective contract

The production objective is lexicographic, not a hidden weighted scalar.

Frozen component order:

1. late hours
2. infeasible day count
3. infeasible excess hours
4. tiny non-final sessions
5. avoidable idle days
6. maximum daily hours
7. overloaded excess hours
8. overloaded day count
9. unjustified marathon excess hours
10. deadline buffer risk
11. priority postponement days
12. session-shape penalty
13. fragmentation count
14. preferred excess squared
15. continuity gap days
16. completion-day sum

Future changes must not casually reorder this list or replace it with a scalar score. Such a change is a scheduler-contract/version change requiring explicit validation.

## 17. Deadline-buffer precedent

The accepted risk curve treats 3+ full days of buffer as healthy and becomes quadratically more severe near/past the deadline:

```text
>=3 -> 0
2   -> 1
1   -> 4
0   -> 9
-1  -> 16
-2  -> 25
...
```

Buffer is a production risk signal, not canonical lateness.

## 18. Session-shape precedent

For focused splittable work:

- non-final <1h fragments are strongly undesirable;
- roughly 2–5h blocks are generally human-friendly;
- very long sessions become increasingly undesirable;
- final short tails may be acceptable;
- atomic/admin work is exempt from focused-session aesthetics.

The scheduler must not improve load smoothness, idle time, priority, or continuity by manufacturing token non-final sessions when no higher-ranked objective improves.

## 19. Severe-marathon precedent

A long session is an `unjustified_marathon` defect only when there is a real alternative.

Current thresholds:

- Lock-in: session >7h;
- Monk: session >6h;

It counts only if effective deadline buffer is under 2 full days **and** another legal date exists.

Forced same-day impossible work is not mislabeled as an avoidable shape defect.

## 20. Search/improvement contract

Production improvement must:

- be deterministic under the same input/tie policy;
- move hours, not pretend percentages are fixed session units;
- validate resulting schedules;
- accept only strict lexicographic improvement;
- preserve hard legality;
- respect configured evaluation/iteration budgets.

Candidate-generation strategy may evolve internally only if all frozen behavioral contracts and regression anchors remain satisfied.

## 21. Version boundary

ARC must reject scheduler output when any of these do not match the request/installed contract:

- engine version;
- input contract version;
- output contract version;
- flavour.

Unknown item IDs, duplicate item/day allocations, past allocations, or failed work conservation must also be rejected.

## 22. Persistence contract

A complete successful V1 run atomically replaces the user's prior disposable scheduler projection.

It is valid to clear all old `scheduled_date`, `execution_rank`, and `SchedulerAllocation` state and rebuild it from the new proposal.

This full replacement must never clear or rewrite canonical planning facts or confirmed progress.

## 23. Compatibility surface

Until intentionally retired/versioned, configured V1 runs still preserve ARC's established compatibility conflict surface.

The legacy scheduler may run as a compatibility pass, but it must not own the final configured V1 proposal.

## 24. Runtime cache contract

`SchedulingState.scheduler_runtime` is disposable cached output.

It may be reused by read-only Timeline requests to avoid unnecessary optimizer runs.

It must never be treated as canonical truth.

## 25. Read-only behavior

A read-only Timeline GET should not unnecessarily perform expensive full optimization when a valid current configured runtime is already cached and no reconciliation-triggering condition occurred.

Convenience/view-only interactions should not unexpectedly mutate or reprioritize planning state.

## 26. Explicit reschedule behavior

Explicit reschedule is a planning operation over disposable schedule state and is undoable through ARC history/checkpoint semantics.

Changing scheduler flavour must save the new flavour first, then run reschedule so the scheduler reads the newly selected policy.

## 27. Output/status honesty

The scheduler must expose conflicts, diagnostics and load classifications honestly.

It must not hide an infeasible user plan by silently weakening canonical constraints.

Valid-but-infeasible canonical state remains representable.

## 28. Determinism/reproducibility

Production behavior must remain reproducible under fixed:

- canonical input;
- flavour;
- scheduler engine version;
- contract versions;
- deterministic tie policy.

If future stochastic algorithms are introduced, they require explicit seeded/local RNG semantics and contract review.

## 29. Forbidden future shortcuts

Do not introduce without explicit contract/version review:

- scheduler writes to canonical priority/date/dependency/hierarchy/progress;
- hidden canonical repair;
- hidden universal weighted quality scalar replacing lexicographic semantics;
- evaluator-driven production search;
- dependency hallucination;
- task decomposition solely for scheduler implementation convenience;
- confirmed progress inferred from a future allocation;
- silently extending deadlines or moving releases;
- treating anchor expiry as overdue;
- making priority into hard precedence;
- discarding infeasible-but-valid user plans;
- swallowing scheduler/version validation failures.

## 30. Change-control rule

Any future scheduler change must answer all of these before merge:

1. Which canonical fields can it read?
2. Which fields can it write?
3. Does it preserve exact remaining-work conservation?
4. Does it preserve hard dependency/release/anchor legality?
5. Does it preserve confirmed progress?
6. Does it preserve the current objective ordering, or is the contract/version intentionally changing?
7. Is output independently validated?
8. Are engine/input/output versions correct?
9. Is deterministic behavior preserved or explicitly seeded?
10. Do ARC scheduler authority, lifecycle, Timeline, history and cutover regressions still pass?
