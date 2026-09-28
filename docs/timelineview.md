# Timeline View — Current Implementation

## Scope

This document describes the Timeline MVP as implemented on branch `integration/scheduler-backend` in the freeze-review package generated from commit `14fc56cea566fed5982f1c6f9db2c282c4c0838b` plus the current dirty Timeline worktree.

The Timeline is a projection/editor over ARC planning state. It does **not** own hierarchy, dependencies, priority, release dates, deadlines, anchors, progress, or scheduler semantics. It renders canonical facts plus scheduler-owned disposable proposal state and translates explicit user interactions into planning commands.

## Main frontend structure

- `TimelinePage.jsx` — page orchestration, date viewport, global search/navigation, filters, panels, scheduler/runtime state, anchor/status sequences.
- `TimelineBoard.jsx` — date headers, lanes, task geometry, constraint lines, markers, scheduler sessions, drag/drop, hover previews, overload/infeasible visuals.
- `TimelineCard.jsx` — task card, completion toggle, duration glyph, details, anchor affordance.
- `TimelineToolbar.jsx` — search, date controls, zoom, type/duration/completed filters, anchor/overload/infeasible navigation, timezone manager.
- `TimelineSidebar.jsx` — Planner-style root filter/sidebar and scheduler-mode control at the bottom.
- `AnchorDialog.jsx` — explicit anchor/date-intent editor and conflict decision flow.
- `TimezonePanel.jsx` — timezone/range management.
- `SchedulerPanel.jsx` — Monk/Lock-in configuration.
- `SchedulerRunButton.jsx` / `SchedulerAura.jsx` — explicit reschedule control and scheduler-state animation.
- `useTimelineActions.js` — Timeline mutations, rapid completion intent queue, query invalidation.
- `useTimelinePreferences.js` — persisted Timeline view/filter preferences.
- `useTimelineUniverse.js` — global unpaginated actionable task index used for search/navigation.
- `useHoverIntent.js` — shared delayed-hover primitive.
- `useSequenceNavigator.js` — shared x/y previous/next navigation primitive.
- `timelineDates.js` — UTC date arithmetic, responsive scales, geometry, lane packing, concentration helpers.
- `timelineConflictPolicy.js` — explicit user-facing conflict choices; no silent canonical repair.

## Backend endpoints used by Timeline

Mounted under `/api/planning/`:

- `GET timeline/` — date-window Timeline projection plus scheduler/runtime information.
- `GET timeline/navigation/` — global actionable Timeline task index, independent of current date window.
- `POST timeline/reschedule/` — explicit global schedule run.
- `POST timeline/anchor/` — validate/apply/remove explicit date intent.
- `POST timeline/move/` — legacy Timeline move surface.
- `POST timeline/replace/` — legacy replacement surface.
- `POST timeline/overload/` — explicit overload permission.
- `GET/PUT scheduler/settings/` — scheduler flavour setting.
- standard item/tag/timezone APIs through the planning router.

## Date viewport and navigation

### Responsive scale

The board computes a responsive number of visible columns from the available board width.

Current target/min/max widths:

| Zoom | Target | Min | Max | Column count bounds |
|---|---:|---:|---:|---:|
| Day | 118 px | 88 px | 150 px | 7–16 |
| Week | 190 px | 140 px | 260 px | 3–8 |
| Month | 250 px | 180 px | 340 px | 3–6 |

The visible columns fill the available board width. Horizontal scrolling is still allowed when task cards extend beyond the visible date range.

### Date movement

- **Today** button jumps to today.
- Jump-to-date input sets the viewport anchor.
- Zoom supports day/week/month.
- Keyboard left/right (`<`/`>` equivalents through arrow navigation) shifts the viewport by one unit of the current zoom.
- Search/anchor/status navigation can jump the viewport directly to an item/date.

All date-only math in `timelineDates.js` uses UTC internally to prevent local timezone drift in date-only values.

## Task placement and geometry

- A task card begins at the **left boundary of its scheduled date**, not the center of the date cell.
- Card width is based on Timeline presentation rules rather than consuming the full date column.
- Task lanes are packed deterministically to avoid overlap and minimize lane count.
- Geometry considers card footprint, canonical constraint interval, markers, and collision clearance.
- A task with multiple scheduler allocations is rendered as multiple visual sessions.
- Secondary session clones do **not** duplicate canonical release/deadline markers or constraints.

## Canonical constraint visualization

Timeline can show:

- release/start constraint;
- deadline/due constraint;
- horizontal constraint line;
- release and deadline endpoint markers.

Endpoint markers remain aligned to their actual date positions.

The renderer avoids orphan floating markers. A marker is shown only when its card or a real visible portion of its constraint is meaningful in the current view.

### Off-screen task preview

If the execution card is outside the visible date window but its constraint line crosses the current viewport:

- the line remains visible;
- an invisible enlarged hit target is available;
- after ~180 ms intentional hover, a read-only task card preview appears near the pointer;
- the trigger is keyboard-focusable as well.

## Hover-intent system

Raw pointer flyovers are intentionally not enough to open noisy UI.

`useHoverIntent` is reused to delay hover activation and cancel it if the pointer leaves before the dwell threshold.

Current behavior includes:

- task detail expansion after a small dwell;
- constraint-line previews after ~180 ms;
- scheduler avatar hover state after ~145 ms;
- toolbar hover pickers use the same intentional-hover philosophy.

When a task card collapses, its unanchored anchor affordance follows the same expanded state rather than lingering on raw `:hover`.

## Task card contents and interaction

Cards expose:

- title;
- completion checkbox;
- duration glyph;
- scheduler/session information when applicable;
- canonical release/deadline context in expanded details;
- anchor affordance.

### Completion behavior

Completion is optimistic in the UI.

A per-item latest-intent queue lets the user quickly toggle complete/incomplete without globally locking every task while scheduling runs.

The backend remains authoritative. The queue serializes canonical transitions while the visible checkbox reflects the latest user intent immediately.

### Completed task historical placement

The scheduler legitimately clears disposable `scheduled_date` when completed work leaves the active scheduling problem.

To keep completed cards visible in Timeline, ARC stores:

`PlanningItem.completed_display_date`

This is **presentation history only**, not scheduler input or canonical planning intent.

On completion ARC captures a meaningful display date before scheduler reconciliation, preferring:

1. current `scheduled_date`;
2. `manual_requested_date`;
3. `due_date`;
4. `start_date`;
5. completion day.

When a completed task is reopened, the UI can temporarily keep the card at the completed-display position while the authoritative scheduler computes its new proposal. Once the scheduler result arrives, the card moves to the new scheduled position.

## Search

Timeline search is global, not limited to the current visible date window.

The global universe comes from `GET /api/planning/timeline/navigation/`.

Search covers task-owned fields such as:

- title;
- description;
- tags;
- item type;
- duration category.

Timeline deliberately does not count ancestor-path text as separate task matches, preventing ghost/duplicate-looking results.

Behavior:

- live filtering on each keystroke;
- matching task cards remain visible while nonmatches are filtered out;
- match count is displayed as x/y;
- first valid result activates automatically instead of showing 0/n;
- previous/next controls cycle globally;
- navigation jumps the viewport if the target lies outside the current window;
- matching cards use the Timeline accent border (`#C3D19B`).

### Completed search semantics

- **Show completed off**: search universe contains incomplete actionable tasks only.
- **Show completed on**: completed tasks are included as well.
- completed tasks use `completed_display_date` for navigation when available.

## Filters

### Root filter

The left sidebar mirrors Planner root selection. The Timeline can show all roots or a selected subset.

### Item type

Toolbar type filtering is supported by Timeline preferences.

### Estimated duration

The duration picker is a multi-select 2×3 control for the six authoritative duration categories:

1. `UNDER_20_MINUTES`
2. `UNDER_1_HOUR`
3. `UNDER_4_HOURS`
4. `UNDER_8_HOURS`
5. `UNDER_16_HOURS`
6. `OVER_16_HOURS`

The same six-level visual language is used on task cards through `DurationGlyph`.

### Completed tasks

A toolbar toggle includes/excludes completed work from ordinary Timeline rendering and global search.

## Anchors / manual date intent

An anchor is canonical explicit user date intent stored as `manual_requested_date`.

### Card anchor control

- hidden until intentional task-card expansion unless already anchored;
- anchored button stays visible;
- anchored state uses the ARC purple/blue anchor color;
- clicking opens the anchor editor;
- an unanchored task defaults the editor to today;
- anchored tasks can be moved or unanchored.

### Dragging

Dragging a card horizontally to a date is interpreted as explicit date intent, not as a disposable scheduler edit.

### Conflict policy

The frontend never silently changes canonical facts to make an anchor fit.

Current explicit decisions:

| Conflict | Allowed explicit decision |
|---|---|
| anchor after deadline | explicitly extend deadline or cancel |
| anchor before release | explicitly move release or cancel |
| capacity exceeded | explicitly allow overload or cancel |
| dependency blocked | acknowledge/store future intent; dependency remains hard |
| past date | no override |
| not eligible | no override |
| duration required | resolve duration first |

## Anchor sequence navigation

Toolbar anchor mode:

- activates immediately to result 1/n rather than 0/n;
- globally counts anchored actionable tasks;
- previous/next jumps between anchors even when they are outside the current viewport;
- active anchored cards use the shared accent highlight language.

## Overload and infeasibility visualization

### Date header indicators

- explicitly/authoritatively overloaded date: small light-red circular indicator;
- infeasible date: warning icon.

### Navigation modes

Toolbar has separate toggles for:

- overloaded dates;
- infeasible dates.

When active:

- shows x/y;
- previous/next cycles through matching dates;
- activation jumps directly to the first match;
- selected date header is highlighted;
- the selected date's left boundary line is accented down the board;
- tasks scheduled on the selected date are accented too.

Explicit user overload permission is surfaced even if cached engine load classification differs.

## Current-week strip

The small strip below date headers represents the current calendar week, Monday through Sunday, clipped to the visible board. It is not a scheduler-load rail.

## Timezones / contextual date ranges

ARC's `Timezone` model is a user-defined named date interval such as a semester, exam period, teaching week, or break. It is unrelated to OS/Django timezone configuration.

Timeline supports:

- display of timezone bands/ranges;
- command-click to open the manager;
- double-clicking a label to edit it inline;
- Enter or clicking away saves the inline title;
- toolbar calendar-edit button opens the manager.

## Scheduler mode control

The scheduler control lives at the bottom-center of the Timeline sidebar.

### Mode art

Current dark assets:

- Lock-in idle: `locked-in-hands-down-Dark.png`
- Monk idle: `monk-mode-hands-down-dark.png`
- hover/scheduling active pose: `locked-in-hands-up-dark.png`

### Behavior

- clicking the avatar explicitly reschedules with the currently configured flavour;
- switching Monk ↔ Lock-in first saves the new flavour, then immediately runs a reschedule using the saved flavour;
- while scheduling, the button is disabled and the active scheduler aura runs;
- after scheduling ends:
  - if pointer is still intentionally hovering, state becomes hover;
  - otherwise it returns directly to idle;
  - there is no active cooldown state in the component.

### Aura implementation

The aura is intentionally compositor-friendly:

- 56 deterministic irregular fragments;
- no Canvas;
- no WebGL;
- no `requestAnimationFrame` particle loop;
- movement is CSS transform/opacity animation;
- each fragment receives a deterministic individual Cartesian path rather than sharing one circular `rotate()+translateX()` orbit;
- fragments vary in shape, scale, radius, phase, direction, speed and color;
- roughly 22/56 (~39.3%) are designated foreground fragments;
- during normal hover all fragments stay behind the avatar;
- during active scheduling those foreground fragments move above the avatar, producing a wraparound/Avatar-state effect;
- `prefers-reduced-motion` disables the animated particle motion.

## Scheduler session rendering

Splittable tasks may receive multiple `SchedulerAllocation` rows. Timeline renders these as separate session cards with allocation hours/percentage while preserving the semantic task as one canonical item.

Canonical release/deadline/anchor constraints belong to the task and are rendered once, not repeated on every session clone.

## Scheduling issue surface

Timeline shows scheduler/compatibility conflicts with task titles when the item can be resolved from the global Timeline navigation index, avoiding raw internal labels such as `Item 178` where possible.

## Persistence and query model

React Query separates:

- date-window Timeline projection;
- global navigation/search universe;
- scheduler settings;
- planner hierarchy.

Planning mutations invalidate the planning query family so all views converge back to authoritative state.

## Current MVP boundary

The following are intentionally considered user-testing decisions rather than pre-freeze feature work:

- whether search previous/next should center a card instead of making its date the leftmost viewport anchor;
- whether navigation transitions should animate rather than jump;
- additional scheduler aura styling beyond current implementation;
- more Timeline-only planning interactions not already represented by canonical commands.
