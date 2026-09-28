# Timeline Contract — Rules and Precedents

## Status

This document is normative for the current Timeline MVP.

Future Timeline changes may improve layout, animation and ergonomics, but must preserve the semantic rules below unless the contract is deliberately reviewed and changed.

## 1. Timeline is a view/editor, not a second planning domain

Timeline must render ARC state and translate explicit gestures into canonical domain commands.

It must not create a separate source of truth for:

- hierarchy;
- dependencies;
- priority;
- release dates;
- deadlines;
- anchors;
- completion/progress;
- scheduler semantics.

All views must converge back to the same canonical backend state.

## 2. Scheduler proposal is not canonical truth

Timeline may display:

- `scheduled_date`;
- `execution_rank`;
- `SchedulerAllocation` sessions;
- scheduler load/status/runtime data.

These are disposable projections.

Timeline must not present them as confirmed progress or immutable user facts.

## 3. Explicit movement means explicit planning intent

Dragging/moving a task to a date is not a cosmetic scheduler tweak.

It is interpreted as explicit manual date intent (`manual_requested_date`) and must go through canonical validation/conflict handling.

Returning to automatic scheduling requires explicit anchor removal.

## 4. No silent canonical repair

Timeline must never silently change release/deadline/dependency/overload semantics merely to make a drag/drop or anchor action succeed.

Required explicit resolution precedents:

- after deadline -> user explicitly changes deadline or cancels;
- before release -> user explicitly changes release or cancels;
- capacity exceeded -> user explicitly allows overload or cancels;
- dependency blocked -> dependency stays hard; acknowledgement may preserve future intent only;
- past date -> no override;
- ineligible structural state -> no override;
- missing duration -> resolve duration first.

## 5. Dependencies remain hard in Timeline

No drag, anchor, search navigation, completion animation, or overload control may visually or canonically imply that a dependency is bypassed.

A dependency-blocked anchor can exist only as future intent under the backend's allowed semantics; it cannot make the dependent executable early.

## 6. Release/deadline visualization must reflect canonical dates

Constraint lines and endpoint markers must be positioned from actual canonical release/deadline values.

Do not move endpoint markers merely to fit card layout.

Do not duplicate the same canonical constraint on every scheduler session clone.

## 7. No orphan endpoint precedent

A release/deadline dot must not float without meaningful visual context.

If the card is offscreen but a real constraint segment crosses the viewport, the line/endpoint may remain and must provide a discoverable preview interaction.

## 8. Offscreen-preview accessibility

A visible constraint for an offscreen card must remain discoverable through intentional hover and keyboard focus.

The preview interaction must not require pixel-perfect hovering over a 1px line; a larger invisible hit target is allowed.

## 9. Intentional hover contract

Timeline should not explode open while the pointer merely glides across the board.

Hover-dependent UI should use a small intentional dwell and cancel on leave.

Current precedent:

- task details: ~155–160 ms class of dwell;
- constraint preview: ~180 ms;
- scheduler avatar hover: ~145 ms.

Exact milliseconds may be tuned, but the principle is frozen: **intentional hover, not raw instantaneous flyover**.

Anchor-button visibility must collapse with the card's intentional expansion state rather than visibly lingering afterward.

## 10. Search universe is global

Timeline search must not be restricted to the current visible date window.

It must use a global actionable task index or semantically equivalent source.

Search navigation must be capable of jumping to matches outside the current viewport.

## 11. Search result integrity

A counted Timeline search match must correspond to a real navigable task.

Do not inflate counts through ancestor/path text that makes multiple child tasks appear as ghost duplicates unless path-based matching is intentionally redesigned and represented clearly.

Current Timeline matching is task-owned search data.

## 12. Search active-result precedent

When a non-empty search begins, it should activate a real first match rather than displaying `0/n` while showing a viewport with no active result.

Previous/next wraps through the global match sequence.

The current jump style (target date becomes viewport anchor/left-side reference) is accepted for MVP and may be revisited through user testing.

## 13. Completed filtering/search semantics

With **Show completed** disabled:

- normal Timeline/search excludes completed work.

With it enabled:

- completed work may render and participate in search/navigation.

## 14. Completed historical position contract

Completing a task may legitimately cause the scheduler to clear disposable `scheduled_date`.

Timeline must not preserve that scheduler field as canonical truth just to keep the card visible.

Instead, `completed_display_date` is durable presentation history only.

It must never become:

- scheduler input;
- release/deadline;
- anchor intent;
- priority;
- progress.

## 15. Reopen transition visual contract

When a completed task is reopened while scheduler reconciliation is running:

1. the UI should immediately show the task as incomplete;
2. it should remain visible at the historical completed position temporarily;
3. that temporary position is frontend presentation state only;
4. once authoritative scheduling returns, it moves to the new scheduler proposal.

The task should not disappear for the duration of the scheduler run.

## 16. Rapid completion intent contract

A running scheduler/completion request must not globally disable every Timeline checkbox.

Per-item rapid complete/reopen actions should preserve the user's newest intent visually and serialize/coalesce authoritative backend transitions safely.

Canonical backend results still win after reconciliation.

## 17. Splittable progress contract

Timeline completion UI must respect the backend's confirmed-progress invariants.

Reopening completed splittable work must use the canonical progress inverse semantics; Timeline must not simply force `is_completed = false` while confirmed progress says otherwise.

## 18. Scheduler session contract

Multiple visual scheduler sessions belong to one semantic task.

They must not become semantic child tasks.

Only the canonical task owns:

- hierarchy identity;
- dependencies;
- release/deadline;
- anchor intent;
- confirmed progress.

Session clones may show allocation hours/percentage/date/rank only.

## 19. Date/card alignment precedent

A scheduled card begins at the left boundary/date line of its scheduled date.

Do not center cards in date cells.

Cards may protrude beyond the final visible column; horizontal scrolling may reveal the protruding portion rather than clamping the card into the wrong date geometry.

## 20. Responsive viewport contract

Date columns should fill usable Timeline width at sensible min/max widths.

The date grid itself should not create gratuitous horizontal whitespace/scrolling.

Horizontal scrolling remains valid for protruding card content and wider content than viewport.

Vertical Timeline scrolling must remain available for packed lanes/content.

## 21. Date-only arithmetic contract

Date-only calculations must avoid local-time/DST drift.

The current implementation uses UTC internally in `timelineDates.js` for date keys/arithmetic.

Future refactors must preserve date-only correctness.

## 22. Duration taxonomy contract

Timeline uses exactly the six authoritative ARC duration categories:

- `UNDER_20_MINUTES`
- `UNDER_1_HOUR`
- `UNDER_4_HOURS`
- `UNDER_8_HOURS`
- `UNDER_16_HOURS`
- `OVER_16_HOURS`

Filters/cards should not invent incompatible duration buckets without a domain-contract change.

## 23. Anchor navigation contract

Anchor mode is global, not viewport-local.

When activated with matches it should select/jump to the first anchor rather than display 0/n.

Previous/next must navigate anchored actionable tasks outside the current date window.

## 24. Overload/infeasible status contract

Overload and infeasibility are **date statuses**, not task statuses.

When their navigation modes are active, the visual emphasis may include:

- date header;
- date boundary line;
- tasks on that date.

But the underlying status belongs to the date/load condition.

Explicit ARC overload permission must remain distinguishable from cached scheduler classification and must not disappear merely because one runtime status object differs.

## 25. Status honesty

Timeline must display infeasible/overloaded states honestly.

Do not hide an impossible plan by moving canonical constraints or pretending load is feasible.

## 26. Current-week strip contract

The accent strip below the date headers currently means **current Monday–Sunday week**, clipped to the visible date window.

Do not reuse the same visual element for an unrelated load/status meaning without intentionally changing its semantic label.

## 27. Timezone-range contract

ARC `Timezone` records are contextual named date ranges, not system timezone offsets.

Timeline editing must preserve valid `start_date <= end_date` backend semantics.

Inline editing/manager interactions are presentation choices; stored interval truth remains backend-owned.

## 28. Scheduler control contract

The sidebar scheduler avatar:

- represents current configured flavour;
- explicit click triggers reschedule using that flavour;
- flavour switch persists the new flavour **before** automatic reschedule;
- scheduling animation reflects actual scheduler-setting/reschedule mutation state.

When scheduling ends:

- if the pointer is still in intentional hover state -> show hover state;
- otherwise -> return to idle immediately.

No mandatory cooldown animation exists in current component behavior.

## 29. Scheduler aura performance contract

The decorative aura must not become a source of Timeline jank.

Current precedent:

- CSS transform/opacity animation;
- deterministic fragment parameters generated once;
- no frame-by-frame React state updates;
- no `requestAnimationFrame` particle simulation;
- no Canvas/WebGL requirement;
- respect `prefers-reduced-motion`.

Visual design may evolve while preserving that performance philosophy.

## 30. Aura depth precedent

During ordinary hover, aura fragments stay behind the avatar.

During active scheduling, approximately 40% of fragments may render above the avatar while the rest remain behind, giving a wraparound energy-field effect.

Foreground scheduling particles must not leak into ordinary hover behavior.

## 31. Query/cache contract

Timeline may optimistically update local React Query cache for responsiveness, but authoritative server reconciliation must follow.

Mutation success/error handling must not leave Planner/Timeline/navigation caches permanently divergent.

## 32. Scheduling issue labels

User-facing conflict/status text should resolve item IDs to meaningful task titles whenever global item information is available.

Raw database IDs are implementation details and should be fallback-only.

## 33. Accessibility contract

Interactive controls must retain meaningful labels/titles and keyboard-accessible paths.

Constraint-only previews must be focusable.

Decorative aura fragments must remain `aria-hidden`.

Search and navigation counts must not depend solely on color.

## 34. Visual highlight consistency

The ARC accent `#C3D19B` is the current shared visual language for active search/anchor/status navigation emphasis.

Future visual redesign can change colors, but must retain sufficiently obvious state distinction and avoid relying on subtle border-only differences where user testing shows ambiguity.

## 35. No feature-driven canonical mutation

The following UI-only actions must not silently reschedule/reprioritize/canonically mutate work:

- opening/closing panels;
- hovering;
- search typing;
- moving through search results;
- changing zoom;
- scrolling;
- toggling a visual status-navigation mode;
- opening scheduler settings without saving a change.

## 36. Freeze-change checklist

Before changing Timeline behavior, verify:

1. Is this only presentation, or does it imply canonical planning intent?
2. If canonical, which domain command owns it?
3. Does the change preserve dependency/release/deadline/anchor rules?
4. Does it preserve scheduler-vs-canonical authority?
5. Does it preserve confirmed progress?
6. Does global search/navigation still have real targets?
7. Do completed/reopened cards remain visually stable during scheduler reconciliation?
8. Are date geometry and UTC date-only semantics still correct?
9. Does intentional-hover behavior remain non-noisy?
10. Do Timeline action/rendering tests, backend interaction/authority tests, build and lint pass?
