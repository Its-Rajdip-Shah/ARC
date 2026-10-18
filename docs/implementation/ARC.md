# ARC — Product and Domain Constitution

**Status:** REVIEW DRAFT — not yet approved or installed in the ARC repository.
**Evidence baseline:** repository documentation snapshot at `6b9b99b01c0f18856f01c894996b6d8c6e3959be`, supplied in `ARC-domain-spec-audit.zip`, plus the separately supplied ARC domain-design documents.
**Purpose:** make ARC's established behavior discoverable before any agent proposes a change. This document is a *navigation and behavioral summary*, not a replacement for frozen contracts or current source/tests.

## 1. Source authority and decision status

When sources disagree, **do not silently resolve the disagreement**. Report the competing claims, their provenance, and a proposed resolution to the product owner before implementation.

1. **Explicitly approved product decisions** and deliberately versioned normative contracts govern intended behavior. In this snapshot, `docs/scheduler_contract.md` and `docs/timeline_contract.md` explicitly declare themselves normative.
2. **Domain-design references** (`general_rules.md`, `invariants.md`, `canonical_state.md`, `state_transitions.md`, `conflict_resolution.md`, `domain_commands.md`) capture substantial design intent; `general_rules.md` calls itself an *architecture freeze candidate*, so its rules are not automatically all frozen.
3. **Implementation documentation** (`docs/scheduler.md`, `docs/timelineview.md`) describes a particular production snapshot; it is not proof that every branch currently behaves that way.
4. **Code and regression tests** establish observed behavior, not automatic permission to override approved product intent.
5. **Historical reports** (`docs/PLANNER_IMPLEMENTATION_REPORT.md`) are snapshots, not live current-state authority.

Rule status vocabulary: `FROZEN` = explicitly normative/approved; `ACCEPTED` = agreed product direction without a frozen contract; `PROPOSED` = not yet approved; `UNRESOLVED` = genuinely undecided; `IMPLEMENTATION GAP` = approved behavior missing from current code, supported by inspection/test evidence. **Never label a gap without inspecting code/tests.**

## 2. Product principle

**ARC automates what the user leaves unspecified and preserves what the user explicitly specifies.** All views operate on one planning domain; automatic scheduling produces replaceable proposals rather than changing the user's canonical facts. Valid but infeasible plans must be represented honestly, not made apparently feasible by silently changing constraints. [Domain-design references: `general_rules.md`, `canonical_state.md`; frozen authority boundary: `docs/scheduler_contract.md`, `docs/timeline_contract.md`.]

## 3. Canonical state versus projections — FROZEN at scheduler/Timeline boundary

Canonical facts include task identity and hierarchy, explicit dependencies, user priority, release/start date, deadline/due date, manual anchor intent, completion and confirmed progress. The scheduler may replace `scheduled_date`, `execution_rank`, `SchedulerAllocation` and runtime/diagnostic state, **not** canonical facts. The Timeline is a view/editor of the same domain, not an independent planning database. Confirmed progress is not inferred from a future proposed allocation. [Sources: `docs/scheduler_contract.md` §§1–3, 11–14, 22; `docs/timeline_contract.md` §§1–3, 17–18.]

## 4. Hierarchy, priority, dependencies — mixed status

- **FROZEN scheduler boundary:** only unfinished actionable frontier work is schedulable; completed/deleted work and structural parents blocked by unfinished children are not ordinary executable candidates. Hard dependency precedence must be respected. [Scheduler contract §§4–5.]
- **Architecture freeze candidate:** hierarchy is decomposition, not automatic sibling precedence. A structural parent can return as residual/closure work when required children cease blocking it. A new structural episode must not accumulate stale residual estimates. [General rules §§Hierarchy; invariants I6–I10.]
- **FROZEN scheduler boundary:** priority influences scheduling preferences; it does not create a hard prerequisite. Execution rank is advisory and is not canonical priority. [Scheduler contract §§8, 22.]
- **Architecture freeze candidate:** dependencies are explicit, cycle-free and completion-based (`A -> B`: B cannot execute before A completes); never invent dependencies from hierarchy or priority. [General rules §§Priority and dependencies; invariants I3–I5.]

## 5. Release, deadline and overdue — #23 product target

- **FROZEN:** release/start and deadline/due are canonical user facts, not scheduler-owned dates. The scheduler cannot move them to repair a proposal. [Scheduler contract §§1, 6–7; scheduler.md §§2–3, 18.]
- **Architecture freeze candidate:** overdue status is derived when an incomplete task crosses its own deadline; anchor expiry alone does **not** mean overdue. An overdue task remains schedulable and recoverable. [General rules 39–40; invariants I18; state transitions T9–T11.]
- **V3 #23 proposed target — requires product approval:** for an incomplete overdue task, preserve the original release and due dates for history, display and canonical state, while constructing *effective scheduling constraints* that permit scheduling its remaining work from the current local-day horizon. Its overdue indication must remain visible until completion or an applicable deadline change. Do not implement by overwriting `start_date`/`due_date`, or by changing the frozen external scheduler engine without an explicit contract review.
- **Important:** an old canonical deadline must not continue to force impossible historical lateness or pressure in the effective scheduler input; exact adapter behavior requires source inspection. Other tasks' genuine future constraints remain intact.

## 6. Anchors and expired intent

- **FROZEN:** a valid active anchor is explicit manual date intent, distinct from a disposable `scheduled_date`. Automatic scheduling respects active anchors; a Timeline drag/move expresses canonical manual intent and must pass validation. Past-date drag/anchor requests cannot be overridden. [Scheduler contract §9; Timeline contract §§3–4.]
- **Established design intent, pending source verification:** once an active anchor's date passes, the hard anchor commitment expires and must not continue binding the scheduler to a past day. Anchor expiry alone does not imply overdue; expired intent/history may be retained separately. [General rules 44–50; state transitions A6, A8–A9; scheduler contract §9.]
- **Clarification from product owner:** tasks lose their active anchors when overdue; no active anchor may remain before `today()`.
- **Do not conflate:** overdue is determined by deadline + incompletion; anchor expiry is determined by passage of the anchor date. They may coincide, but are not the same event. A historical or suspended anchor record is not an active scheduling constraint.
- **Unresolved implementation detail:** whether expired canonical `manual_requested_date` is cleared, status-marked or retained as inactive history in the current schema. Inspect reconciliation and tests; do not guess or silently erase audit history.

## 7. Progress and completion

- **FROZEN scheduler boundary:** remaining work must be conserved; confirmed progress and `ProgressSegment` history are canonical, while proposed future allocation percentages are not. Atomic categories (`<20m`, `<1h`, `<4h`) remain single-day; larger categories can split across days without creating semantic children. [Scheduler contract §§11–14; scheduler.md §§2, 6, 13.]
- **Architecture freeze candidate:** completing/reopening tasks and individual progress segments must preserve unrelated confirmed progress and valid hierarchy/dependency semantics. Splittable-to-atomic duration changes must not resurrect discarded partial-progress semantics. [General rules 53–71; invariants I19–I24; state transitions.]
- **V3 #23:** completing an overdue task removes it from the *active* overdue set; canonical deadline/history remain available. [State transitions T10.]

## 8. Conflicts, overload and safety

- **FROZEN:** never silently change a release, deadline, anchor or dependency to make a move/schedule work. Invalid past-date actions have no override. When user action requires changing a conflicting canonical constraint, require an explicit resolution. [Timeline contract §4; scheduler contract §§1–2, 9–10.]
- **FROZEN scheduler boundary:** genuine infeasibility and overload must be surfaced honestly; the scheduler must validate outputs before atomically replacing disposable projection state. [Scheduler contract §§2, 10, 22, 27.]
- **Architecture freeze candidate:** distinguish domain-invalid operations (reject), valid-but-risky operations (warn/confirm), and valid-but-infeasible facts (preserve and surface). Undo/restore is validated against the *current* world, not blind database time travel. [Conflict resolution; invariants I28–I33.]

## 9. Time, views and determinism

- **FROZEN Timeline boundary:** date-only arithmetic and timezone handling must not shift canonical date meaning; completed items retain historical Timeline presentation as defined by the Timeline contract. Planner/Timeline/Focus must not create competing planning truth. [Timeline contract §§14–15, 21, 27, 35.]
- **FROZEN scheduler boundary:** identical reconciled input, flavour and engine/version policy produce deterministic proposals. Scheduler runtime cache is disposable. Explicit reschedule is a deliberate action. [Scheduler contract §§24, 26, 28; scheduler.md §§11, 15–16.]
- **Current documented integration:** frozen external engine `c11.15.9`, V1 input/output contracts, `lock-in` and `monk` flavours. These are snapshot facts, not a mandate to change engine internals for V3 #23. [Scheduler contract Status; scheduler.md Version.]
- **FROZEN frontend boundary:** Figma `MVP arc` root `2690:432` is the implementation design source, not `ARC FULL`; the user-facing view is named Planner, route `/planner`; admin is separate from student shell. [docs/FRONTEND_ARCHITECTURE.md.]

## 10. Product approval gate — development operating rule

For each roadmap item:
1. Read this document and **all relevant normative contracts**; consult detailed domain-design references.
2. Inspect actual source, tests, migrations, Git state and repository knowledge index. Identify contradictions and what is *already implemented*.
3. Present **current behavior**, **required behavior**, **exact gap**, **proposed user-visible behavior**, **edge cases**, **planned technical boundaries**, and **testable acceptance criteria**.
4. Ask the product owner to approve the **behavioral proposal**, not routine engineering choices. Do not invent questions already settled by these rules.
5. Only after approval, create the worker contract and implement/test/repair autonomously. Escalate only new consequential product decisions or proposed changes to frozen contracts.
6. Before freezing, independently inspect changed code and evidence, including tenant isolation, timezone boundaries, undo/redo, anchors, and the existing scheduler modes where applicable.
7. Update this document **only for an approved behavioral decision**; record provenance, approval, effective date and impacted contracts/tests. Do not rewrite frozen history to match a bug.

## 11. V3 #23 — acceptance examples for approval

These examples specify the intended product outcome; implementation details remain unverified until source inspection.

1. **Incomplete, past deadline:** release Oct 10, due Oct 12, local today Oct 15. Display remains overdue and original dates remain unchanged; remaining work can be proposed on Oct 15 or later subject to dependencies and other genuine constraints.
2. **Expired anchor:** an anchor for Oct 11 is **not active** on Oct 15. The task may be rescheduled from the current horizon; preserve any required historical record. Anchor expiry by itself is not overdue if deadline is still future.
3. **Completion:** completing an overdue task removes it from active overdue while retaining historical dates.
4. **Deadline change:** explicitly extending due date to the future can remove overdue status after reconciliation; the scheduler then respects the new future deadline.
5. **Non-overdue task:** unchanged release/deadline/anchor and dependency behavior, including future active anchors.
6. **Isolation and dates:** behavior uses the user's applicable local date, does not leak tasks across tenants, and does not change a date through timezone conversion.
7. **Atomic persistence:** failed schedule validation must not partially overwrite canonical facts or scheduler-owned state.

## 12. Evidence and known limits of this draft

- Reviewed 11 repository documentation files in `ARC-domain-spec-audit.zip` (Git HEAD `6b9b99b01c0f18856f01c894996b6d8c6e3959be`), including both normative contracts and the documented scheduler/Timeline behavior.
- Also consulted the separately provided domain-design corpus. Some files are labeled freeze *candidates*, not approved production contracts.
- **Not yet reviewed for this stage:** actual `backend/planning/` source, migration state, runtime data, regression tests, or external scheduler package implementation. Therefore this document does **not** assert that V3 #23 is already broken or that the code satisfies these rules.
- **Potential authority issue:** `AGENTS.md` says to commit small and often, while the current user-directed Worker workflow requires no silent commits. For autonomous worker operation, explicit user authorization to commit remains necessary.
- **Open review question:** confirm the precise handling of stored expired anchors (clear field vs mark inactive/preserve history) from source before choosing code changes. This is a technical representation question unless it changes user-visible behavior.

## 13. Reference map

**Normative current repository contracts:** `docs/scheduler_contract.md`, `docs/timeline_contract.md`.
**Documented implementation:** `docs/scheduler.md`, `docs/timelineview.md`.
**Frontend contract:** `docs/FRONTEND_ARCHITECTURE.md`.
**Repository workflow:** `AGENTS.md`, `.arc-knowledge/repo_index.md` (not included in this audit ZIP).
**Domain-design corpus (separately supplied):** `general_rules.md`, `invariants.md`, `canonical_state.md`, `states.md`, `state_transitions.md`, `conflict_resolution.md`, `domain_commands.md`, `arc_guaranteed.md`, `algorithm_manages.md`.
**Historical audit, not current truth:** `docs/PLANNER_IMPLEMENTATION_REPORT.md`.


## Approved V3 #23 behavior — 17 October 2026

**Status: ACCEPTED for V3 #23 only.** This does not
promote other draft rules to FROZEN.

- Incomplete deadline-overdue tasks remain visible while
  their canonical release and due dates are preserved.
  Effective scheduling permits recovery from today's
  applicable local-day horizon.
- Deadline-overdue Timeline cards suppress obsolete
  release/due markers and display a red deadline dot.
- Missed active anchors carry for the established three
  days and use a red anchor button. Release/due markers
  remain for anchor-overdue-only tasks.
- After carry expiry, the anchor no longer constrains
  scheduling. The missed commitment remains in Planner's
  Anchor Overdue section until completion or re-anchoring.
- Deadline Overdue takes precedence when both apply.
  Carried anchors rank before expired anchor histories,
  then by oldest original anchor date.
- Manual anchor actions requiring canonical date changes
  require explicit confirmation. Cancellation preserves
  the original dates.
- Planner Overdue contains navigable Deadline and Anchor
  sections.
- HA-01 through HA-04 received human visual acceptance
  on 17 October 2026.
- Git freeze and commit are not yet authorized.

Frozen scheduler and Timeline contracts remain authoritative.
