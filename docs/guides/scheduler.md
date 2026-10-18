# ARC Scheduler — Current Implementation

This describes the current integration. Normative rules are in [`docs/contracts/scheduler.md`](../contracts/scheduler.md). This guide does not override that contract.

## Version and production boundary

ARC integrates the frozen external scheduler through the V1 contract.

- Engine version: `c11.15.9`
- Input contract version: `1`
- Output contract version: `1`
- Production flavours: `lock-in`, `monk`
- Normal improver defaults: `max_iterations = 40`, `max_evaluations = 4000`

The scheduler is a **proposal engine**. ARC remains authoritative for canonical planning facts.

## High-level chronological sequence

A configured schedule run proceeds in this order:

1. ARC reconciles/reads canonical planning state.
2. ARC runs the legacy compatibility scheduler only to preserve the established conflict/API surface.
3. ARC builds an immutable `SchedulerInputV1` for the frozen V1 engine.
4. The engine derives work estimates and scheduling mechanics.
5. It constructs an initial flavour-specific schedule.
6. It improves that schedule using deterministic strict-improvement search.
7. It validates the final plan.
8. It returns a versioned `SchedulerOutputV1` with allocations, estimates, load statuses, objective and metadata.
9. ARC validates the output boundary again.
10. ARC atomically replaces only disposable scheduler-owned projection state.
11. ARC stores a serialized runtime snapshot for read-only Timeline reuse.
12. Timeline/Focus reproject the result; canonical task facts remain unchanged.

If no scheduler flavour has been explicitly selected, ARC continues using the frozen legacy scheduler path.

---

# 1. ARC selects scheduler candidates

The V1 adapter starts from unfinished actionable execution-frontier work.

It excludes:

- completed work;
- deleted work;
- structural/decomposed items that still have unfinished visible children;
- dependents whose unresolved prerequisite cannot itself appear in the V1 scheduling frontier.

Unlike the older scheduler, V1 retains both sides of an unfinished dependency edge when both are schedulable so it can plan the dependent strictly after the prerequisite completes.

Candidate ordering before engine input is deterministic:

```text
(positioned priority first,
 priority_position,
 due_date or +∞,
 release/start_date or +∞,
 item_id)
```

This ordering does not manufacture a priority for unpositioned work.

---

# 2. ARC builds `SchedulerInputV1`

Each task contributes:

- `item_id`
- authoritative duration category
- canonical priority position or null
- release/start date
- deadline/due date
- active future anchor/manual date
- canonical `percent_completed`
- `remaining_fraction = max(0, 100 - percent_completed) / 100`
- residual-work flag
- existing `scheduled_date` as observational scheduler state only

The request also contains:

- dependency edges;
- per-duration capacity configuration;
- explicitly allowed overload dates;
- optional explicit total-hour estimates.

ARC currently supplies no exact per-task hour estimates, therefore `explicit_total_hours = {}` and the frozen engine uses duration-category priors.

## Duration-hour priors

These estimate **100% of an item**:

| Duration category | Frozen fallback hours |
|---|---:|
| `UNDER_20_MINUTES` | 0.33 h |
| `UNDER_1_HOUR` | 1 h |
| `UNDER_4_HOURS` | 4 h |
| `UNDER_8_HOURS` | 8 h |
| `UNDER_16_HOURS` | 16 h |
| `OVER_16_HOURS` | 24 h prior |

For bounded categories the upper bound is deliberately used so that:

```text
allocation_percentage = allocated_hours / estimated_total_hours × 100
```

`OVER_16_HOURS = 24h` is a prior, not canonical truth.

Remaining work in hours is conceptually:

```text
remaining_hours = total_hour_estimate × remaining_fraction
```

---

# 3. Shared hard scheduling mechanics

Lock-in and Monk share the same hard semantics:

- releases are respected;
- anchors/manual date intent is respected according to contract;
- dependencies are completion-based precedence constraints;
- remaining work is conserved exactly;
- allocations cannot be in the past;
- scheduler cannot mutate canonical hierarchy, dependencies, priority, release, deadline, anchor, or confirmed progress;
- final proposal is validated independently.

Dependency urgency is propagated backward through the dependency graph using planner-only effective deadlines: a prerequisite may inherit urgency from a dependent whose deadline/anchor cannot be met unless the prerequisite finishes earlier.

The scheduler may exploit otherwise free capacity with unrelated work; a relaxed unrelated task does **not** have to wait merely because another dependency chain exists.

---

# 4. Flavour policy

The two flavours share legality and objective semantics. They differ in human scheduling policy.

## Lock-in

```text
preferred_daily_hours          = 8
soft_max_daily_hours           = 10
focused_task_share             = 0.65
minimum_useful_session_hours   = 1
maximum_focused_session_hours  = 6
continuation_target_share      = 0.60
continuation_bonus             = 1000
```

Intent: get ahead aggressively, build deadline buffer, and maintain momentum.

## Monk

```text
preferred_daily_hours          = 6
soft_max_daily_hours           = 8
focused_task_share             = 0.50
minimum_useful_session_hours   = 1
maximum_focused_session_hours  = 5
continuation_target_share      = 0.50
continuation_bonus             = 1000
```

Intent: calmer load distribution and stronger overload avoidance while still protecting deadlines.

These ordinary focus caps are soft policy values, not hard legality limits. Deadline/anchor pressure can justify longer days or longer sessions.

---

# 5. Load classification

There is no hard daily-hour cap inside the production scheduler.

Daily load status uses the flavour's preferred and soft-max values:

```text
hours == 0                         -> empty
hours <= preferred / 2             -> chill
hours <= preferred                 -> normal
hours <= soft_max                  -> locked-in
soft_max < hours <= 24             -> overloaded
hours > 24                         -> infeasible
```

Therefore, if genuinely unavoidable work requires 25–30 hours on a date, ARC represents the impossible/heavy date honestly rather than moving work late merely to make the display prettier.

Weekly and monthly status are derived from the generated daily loads.

---

# 6. Initial construction

The flavour planner works in **hours**, not pre-fixed allocation percentages.

The constructor:

1. builds effective work estimates;
2. determines readiness from release/dependency state;
3. considers deadline pressure and inherited downstream urgency;
4. accounts for anchored/fixed work and day headroom;
5. chooses ready work deterministically;
6. allocates work mass across legal days;
7. favors meaningful continuation of already-started splittable work;
8. avoids tiny non-final sessions when possible;
9. derives allocation percentage only after hour placement is known.

Atomic buckets are:

- `UNDER_20_MINUTES`
- `UNDER_1_HOUR`
- `UNDER_4_HOURS`

Larger work may be split across days without creating semantic task children.

---

# 7. Deadline-pressure principle

Deadline is canonical; urgency is derived.

The scheduler reasons about:

```text
remaining work
÷
remaining usable legal capacity before effective deadline
```

rather than sorting only by due date.

A distant deadline with healthy slack does not automatically dominate flexible work. Conversely, flexible work must not consume capacity so aggressively that constrained work becomes predictably impossible.

Deadline lateness is more important than comfort: unavoidable overload is preferred over manufacturing lateness.

---

# 8. Constructor ranking and session-size formulas

The adaptive constructor repeatedly recomputes a deterministic ready-task ordering for the current day.

## Minimum sane sessions needed

```text
if remaining_hours <= 0:
    sessions_needed = 0
elif task is atomic:
    sessions_needed = 1
else:
    sessions_needed = ceil(remaining_hours / maximum_focused_session_hours)
```

## Planner-only effective deadline propagation

Starting from each task's canonical due date, walk the dependency graph in reverse topological order. For every `A -> B`:

```text
B_sessions = minimum_sessions_needed(B)
A_candidate_due = B_effective_due - B_sessions days
```

If B is anchored:

```text
A_candidate_due = B_anchor_date - 1 day
```

A's effective deadline becomes the earliest applicable candidate. Canonical due dates are never rewritten.

## Deadline pressure tier

```text
usable_days = max(1, effective_due - day + 1)
sessions_needed = minimum_sessions_needed(...)
slack = usable_days - sessions_needed

slack <= 0 -> tier 0
slack == 1 -> tier 1
slack <= 3 -> tier 2
otherwise  -> tier 3
no effective deadline -> tier 3
```

Lower tier sorts earlier.

## Daily task sort key

Ready tasks are sorted lexicographically by:

```text
(
  anchor_rank,                 # unstarted task anchored today first
  deadline_pressure_tier,
  continuation_rank,           # -1000 if already started, else 0
  days_to_effective_due,       # 10000 when none
  priority_position,           # 10000 when unset
  -direct_dependent_count,     # unlock more downstream work earlier
  item_id,                     # deterministic tie-break
)
```

## Required-today lower bound

For tasks with a due date:

```text
remaining_usable_days = max(1, due_date - day + 1)
required_today_hours = remaining_hours / remaining_usable_days
```

No due date -> `required_today_hours = 0`. This is a lower bound protecting feasibility, not an equal-allocation requirement.

## Ordinary session size

Let:

```text
ordinary_headroom = max(0, preferred_daily_hours - current_day_load)
max_headroom      = max(0, soft_max_daily_hours - current_day_load)
```

For a splittable task:

- if it is the only ready task:

```text
ordinary_candidate = min(ordinary_headroom, maximum_focused_session_hours)
```

- if multiple tasks are ready:

```text
ordinary_candidate = min(
    preferred_daily_hours × focused_task_share,
    ordinary_headroom,
    maximum_focused_session_hours,
)
```

- if task already started, compute:

```text
continuation_target = min(
    preferred_daily_hours × continuation_target_share,
    ordinary_headroom,
    maximum_focused_session_hours,
    remaining_hours,
)
ordinary_candidate = max(ordinary_candidate, continuation_target)
```

Then deadline pressure wins if stronger:

```text
candidate = max(ordinary_candidate, required_today_hours)
candidate = min(candidate, remaining_hours)
```

If the candidate would leave a final tail smaller than `minimum_useful_session_hours`, the constructor attempts to absorb that tail when soft headroom/deadline pressure allows. A non-final session smaller than the minimum useful session is rejected (`0h`) rather than creating a token fragment.

Atomic work stays whole. If an atomic task is due now it is scheduled even if this overloads the day.

---

# 9. Production improvement/search

After construction, the production improver performs deterministic strict-improvement search over **hours**.

Core move types include:

- single `WorkHourMove`;
- atomic `CompoundWorkHourMove`;
- consolidation moves;
- balanced exchanges;
- anchored-congestion recovery;
- lateness recovery;
- load-preserving window repacks;
- block repacks;
- repair-window candidates.

A candidate is accepted only when its full production objective key is lexicographically smaller than the incumbent.

The engine does not optimize one weighted scalar.

## Important consequence: there are no scalar objective weights

The production objective is **lexicographic**.

That means component 1 has absolute precedence over component 2; component 2 is considered only when component 1 is equal; and so on.

So asking for a numeric weight such as `deadline = 1000, overload = 20` would be inaccurate. The ordering itself is the weighting system.

---

# 10. Frozen 16-component objective

The exact C11.15.9 comparison key is minimized in this order:

1. `late_hours`
2. `infeasible_day_count`
3. `infeasible_excess_hours`
4. `tiny_nonfinal_sessions`
5. `avoidable_idle_days`
6. `max_daily_hours`
7. `overloaded_excess_hours`
8. `overloaded_day_count`
9. `unjustified_marathon_excess_hours`
10. `deadline_buffer_risk`
11. `priority_postponement_days`
12. `session_shape_penalty`
13. `fragmentation_count`
14. `preferred_excess_squared`
15. `continuity_gap_days`
16. `completion_day_sum`

Conceptually:

```text
objective(schedule) = (
  late_hours,
  infeasible_day_count,
  infeasible_excess_hours,
  tiny_nonfinal_sessions,
  avoidable_idle_days,
  max_daily_hours,
  overloaded_excess_hours,
  overloaded_day_count,
  unjustified_marathon_excess_hours,
  deadline_buffer_risk,
  priority_postponement_days,
  session_shape_penalty,
  fragmentation_count,
  preferred_excess_squared,
  continuity_gap_days,
  completion_day_sum,
)
```

Candidate B replaces incumbent A iff:

```text
objective(B) <lexicographically objective(A)
```

## Metric meanings / known formulas

### `late_hours`

Total work placed after its effective deadline. Any reduction dominates every comfort/shape consideration.

### `infeasible_day_count`

Count of dates whose total planned work exceeds the physical 24-hour day.

### `infeasible_excess_hours`

```text
Σ max(0, daily_hours - 24)
```

over infeasible dates.

### `tiny_nonfinal_sessions`

Count of splittable **non-final** focused sessions below the 1-hour minimum useful session. These are treated as near-hard human-shape defects.

### `avoidable_idle_days`

This metric is active only for Lock-in. From `today` up to (but excluding) the final active scheduled date, each empty date is counted once if there exists a scheduled task that:

- is released by that date;
- is not anchored to a different date; and
- still has one or more of its allocations scheduled after that empty date.

This prevents Lock-in from manufacturing early empty days while executable movable work is merely being postponed. Monk intentionally does not receive this compression pressure.

### `max_daily_hours`

```text
max(daily_hours[d])
```

### `overloaded_excess_hours`

For each day above the flavour soft maximum, the excess is accumulated:

```text
Σ max(0, daily_hours[d] - soft_max_daily_hours)
```

for overloaded (non-infeasible) load.

### `overloaded_day_count`

Number of dates above the flavour soft maximum and not classified physically infeasible.

### `unjustified_marathon_excess_hours`

A severe focused-session metric introduced in C11.15.8 and refined in C11.15.9.

A session contributes only when:

1. task is splittable;
2. session is above the severe threshold:
   - Lock-in: `> 7h`
   - Monk: `> 6h`
3. task has **< 2 full days** of effective deadline buffer;
4. another legal scheduling date exists.

The excess is the amount above the flavour threshold.

Thus a forced 25h due-today item does not get mislabeled as an avoidable shape defect when no alternative legal date exists.

### `deadline_buffer_risk`

Risk uses a quadratic buffer curve. Frozen values documented for effective completion buffer:

```text
buffer >= 3 days -> 0
buffer = 2       -> 1
buffer = 1       -> 4
buffer = 0       -> 9
buffer = -1      -> 16
buffer = -2      -> 25
... continuing quadratically
```

Equivalent documented pattern around the danger zone:

```text
risk = (3 - buffer_days)^2
```

when buffer is below 3 days, otherwise 0.

This is production risk, not canonical lateness.

### `priority_postponement_days`

For priority position `p`:

```text
priority_weight(p) = 0              if p is unset
priority_weight(p) = 1 / p          otherwise
```

The task's earliest feasible start is:

```text
earliest = max(today, release_date or today)
```

If anchored, `earliest = anchor_date`. Otherwise, for every prerequisite with scheduled work:

```text
earliest = max(earliest, prerequisite_completion_date + 1 day)
```

Then:

```text
delay_days = max(0, actual_first_session_date - earliest)
priority_postponement_days += delay_days × priority_weight(priority_position)
```

So priority 1 has weight 1, priority 2 has 1/2, priority 3 has 1/3, etc.; unpositioned work contributes no priority-postponement penalty.

### `session_shape_penalty`

For one splittable session of `h` hours, atomic/admin buckets excluded:

```text
if h <= 0:
    penalty = 0

elif h < 1:
    penalty = 4 + 4 × (1 - h)

elif h < 1.5:
    penalty = 2 × (1.5 - h)

elif h < 2:
    penalty = 0.5 × (2 - h)

elif h <= 4:
    penalty = 0

elif h <= 5:
    penalty = 0.5 × (h - 4)

elif h <= 6:
    penalty = 0.5 + 1.5 × (h - 5)

else:
    excess = h - 6
    penalty = 2 + excess + excess²
```

A genuinely small **final** remainder below the flavour's minimum useful session is exempt from this penalty. Non-final sub-hour work is counted separately by `tiny_nonfinal_sessions`.

### `fragmentation_count`

For each splittable task with `n` allocations:

```text
fragmentation_count += max(0, n - 1)
```

One allocation is the zero-fragment baseline.

### `preferred_excess_squared`

Quadratic comfort penalty for exceeding the flavour's preferred daily hours:

```text
Σ max(0, daily_hours[d] - preferred_daily_hours)^2
```

### `continuity_gap_days`

For each adjacent pair of sessions of the same task:

```text
gap = (right_session_date - left_session_date).days - 1
continuity_gap_days += max(0, gap)
```

Continuity is soft and may yield to globally better schedules.

### `completion_day_sum`

For every task with scheduled work:

```text
completion = max(session dates for task)
completion_day_sum += (completion - today).days
```

This acts as the final tie-break-like preference for earlier overall completion after all more important criteria are equal.

---

# 11. Determinism and budget

The production improver is deterministic under the same canonical input, flavour, engine version and tie policy.

Default production improvement budget:

```text
max_iterations = 40
max_evaluations = 4000
```

C11 saturated-world acceptance used larger diagnostic/acceptance budgets (`120` iterations / `12000` evaluations), but the public production default remains 40/4000.

---

# 12. Output

`SchedulerOutputV1` returns:

- scheduler allocations: item, date, hours, percentage, execution rank;
- work estimates and their source;
- daily load/status;
- weekly load/status;
- monthly load/status;
- 16-component production objective;
- conflicts;
- diagnostics;
- metadata:
  - engine version;
  - input/output contract versions;
  - flavour;
  - iterations;
  - evaluations;
  - termination reason.

Load status enum:

- `empty`
- `chill`
- `normal`
- `locked-in`
- `overloaded`
- `infeasible`

---

# 13. ARC validates the returned proposal

Before persistence ARC rejects output when:

- engine version differs from installed frozen engine;
- input contract version differs;
- output contract version differs;
- returned flavour differs from requested flavour;
- output references an unknown task;
- any allocation is in the past;
- duplicate `(item, date)` allocations exist;
- allocation percentages fail exact remaining-work conservation.

For each task:

```text
expected_percentage = remaining_fraction × 100
actual_percentage   = Σ output allocation percentages for that task
```

Requirement:

```text
actual_percentage == expected_percentage
```

---

# 14. Persistence into ARC

Persistence is atomic and scheduler-owned state is fully disposable.

ARC first clears, for the user:

- every `PlanningItem.scheduled_date`;
- every `PlanningItem.execution_rank`;
- all `SchedulerAllocation` rows.

Then it rebuilds the complete V1 proposal.

For each scheduled task:

- first allocation date becomes summary `scheduled_date`;
- first allocation rank becomes summary `execution_rank`.

For genuine splittable non-residual work, each future allocation becomes a `SchedulerAllocation` row.

The scheduler does **not** touch `ProgressSegment`.

---

# 15. Compatibility scheduler and runtime cache

When a user has configured Monk/Lock-in, ARC still runs the legacy scheduler first **only** to preserve the established conflict/API contract.

The V1 engine then replaces the legacy disposable proposal.

The response therefore contains:

- V1 disposable schedule as authoritative scheduler proposal;
- compatibility conflict list from the legacy surface.

The serialized V1 runtime is stored in `SchedulingState.scheduler_runtime` so read-only Timeline requests can reuse the result without repeatedly running the optimizer.

---

# 16. Daily maintenance and explicit reschedule

`daily_schedule()` decides between:

- `global` maintenance once per local day;
- `minimal` read-time maintenance afterward.

For configured V1 users, if today's runtime cache is still valid and no anchor expired, a minimal read reuses the cached runtime instead of running the expensive optimizer.

Explicit `reschedule()` always performs a global schedule and records an undoable history checkpoint around the disposable schedule state.

---

# 17. Flavour changes

Frontend flavour switching is ordered:

```text
PUT scheduler/settings/ with new flavour
        ↓ await success
POST timeline/reschedule/
        ↓
refresh settings + timeline + navigation queries
```

Therefore the automatic reschedule reads the newly persisted flavour rather than the old one.

Clicking the scheduler avatar separately calls explicit reschedule using whichever flavour is currently configured.

---

# 18. What the scheduler does not decide

The scheduler cannot create/change:

- hierarchy;
- dependency edges;
- canonical priority;
- release/start dates;
- due/deadline dates;
- manual anchor intent;
- confirmed progress;
- semantic task decomposition;
- completion truth.

It owns only disposable proposal state and diagnostics.
