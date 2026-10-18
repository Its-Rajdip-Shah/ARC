# ARC documentation

Graphify communities on the 2026-10-18 graph (`d793427`) decided this layout. Documents that shared a job were folded together. Documents that graphify kept in different communities, or that freeze a rule, stayed separate.

## Read this first

| Question | Document |
| --- | --- |
| What is ARC and how do I start? | [`README.md`](../README.md) |
| How do I set up a working copy? | [`setup/developer.md`](setup/developer.md) |
| How do I prove a clean clone? | [`setup/production.md`](setup/production.md) |
| Why is the system shaped this way? | [`ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Which requirement maps to which code? | [`FR_TRACEABILITY.md`](../FR_TRACEABILITY.md) |
| What must an agent preserve? | [`AGENTS.md`](../AGENTS.md) |
| Where is the file map? | [`.arc-knowledge/repo_index.md`](../.arc-knowledge/repo_index.md) |

## Kept separate

These do not replace each other.

| Role | Document | Why it stays separate |
| --- | --- | --- |
| Day-to-day setup | [`setup/developer.md`](setup/developer.md) | Developer Setup Guide community. The root README only keeps the short path. |
| Clean-clone validation | [`setup/production.md`](setup/production.md) | Production Setup Guide community. It is a release check, not a deploy manual. |
| Frontend package commands | [`frontend/README.md`](../frontend/README.md) | Frontend Documentation community. It is the package entry, not the monorepo guide. |
| System decisions | [`ARCHITECTURE.md`](../ARCHITECTURE.md) | Architecture narrative. |
| Product and domain draft | [`governance/constitution.md`](governance/constitution.md) | Development Governance, product law. Still a review draft. |
| How work is authorized | [`governance/workflow.md`](governance/workflow.md) | Same community as the constitution, different job: process, not behavior. |
| Scheduler rules | [`contracts/scheduler.md`](contracts/scheduler.md) | Frozen contract. |
| Scheduler behavior | [`guides/scheduler.md`](guides/scheduler.md) | Implementation description. It does not override the contract. |
| Timeline rules | [`contracts/timeline.md`](contracts/timeline.md) | Frozen contract. |
| Timeline behavior | [`guides/timeline.md`](guides/timeline.md) | Implementation description. It does not override the contract. |
| Student UI structure | [`architecture/frontend.md`](architecture/frontend.md) | Frontend Architecture Docs. Priority is the `/priority` route of Planner. |
| A2 security evidence | [`security/a2-gap-analysis.md`](security/a2-gap-analysis.md) | Marking matrix. Later password-reset notes are appended; the original matrix is unchanged. |
| How to run gates | [`tests/README.md`](../tests/README.md) | Five levels: smoke, regression, integration, certify, browser. |
| Which suite is in which gate | [`tests/contracts/regression_matrix.md`](../tests/contracts/regression_matrix.md) | Same community, different artifact. |
| Agent working map | [`.arc-knowledge/architecture.md`](../.arc-knowledge/architecture.md) | Navigation aid. Study-plan calls are gone; the unused column stays. |

## Historical, not current behavior

| Document | What it is |
| --- | --- |
| [`reviews/PLANNER_IMPLEMENTATION_REPORT.md`](reviews/PLANNER_IMPLEMENTATION_REPORT.md) | Branch audit of the student shell. Overlaps the frontend architecture community; the living structure is `architecture/frontend.md`. |
| [`reviews/ARC_V3_SIX_TASKS_REPORT.md`](reviews/ARC_V3_SIX_TASKS_REPORT.md) | Six-task snapshot from before that work landed. |
| [`reviews/ARC_PR_DESCRIPTION.md`](reviews/ARC_PR_DESCRIPTION.md) | Pull-request text for the V3 planning work. |
| [`reviews/ARC_PR_FREEZE_REVIEW.md`](reviews/ARC_PR_FREEZE_REVIEW.md) | Freeze findings from 2026-10-18. |
| [`reviews/password-reset-and-study-plan-removal.md`](reviews/password-reset-and-study-plan-removal.md) | Design that shipped. Password reset is live; the study-plan API is not mounted. |
