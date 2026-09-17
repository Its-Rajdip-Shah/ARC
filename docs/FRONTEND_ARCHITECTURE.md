## Figma source of truth

Implementation MUST use the `MVP arc` Figma page.

- Figma file: `Clothes`
- MVP root node: `2690:432`
- `ARC FULL` is NOT an implementation source.
- Figma layer/group structure is not assumed to represent React architecture.
- Component boundaries are derived from rendered MVP frames, repeated behaviour,
  requirements, and existing application architecture.
- Legacy internal frame/layer names such as `Text View` may remain in Figma;
  the product term is `Planner`.
## Terminology

- The former `Text` view is called **Planner**.
- Canonical frontend route: `/planner`.
- Canonical component vocabulary: `PlannerPage`, `PlannerSidebar`, etc.
- `Timeline` remains Timeline.

## Figma frames vs application structure

A Figma frame represents a visual state, not necessarily a route or React page.

Examples:

- Planner landing / selected item / nested-task creation are states of `PlannerPage`.
- Timeline landing / timezone creation / timezone management are states of `TimelinePage`.
- An open hamburger menu is an overlay state.
- Admin uses its own existing `AdminLayout`.

Routes are created only for independently navigable application destinations.

## Student shell

Persistent student UI:

- `StudentLayout`
- `StudentViewNav`
  - `ViewToggle` (`Planner | Timeline`)
  - `SearchBar`
- `HamburgerButton`
- `NavigationDrawer`
- feature content through React Router `Outlet`

The top-centre navigation is persistent but is not a conventional full-width top bar.

## Sidebar ownership

The left-side region varies significantly between features.

`StudentLayout` must not own feature-specific sidebar contents. Planner, Timeline,
Marks and other features compose the sidebar appropriate to their behaviour.

Avoid a global `Sidebar` component containing route-specific conditionals.

## Feature state

Interactive variants shown as separate Figma frames should normally remain local
component state unless independent navigation/deep-linking provides a reason for a route.

Examples include:

- selected planner item
- nested-task form
- timezone creation
- timezone management
- hamburger drawer
- assignment controls

## Priority

Priority is closely associated with Planner but is not global student chrome.

The Priority toggle:

- appears on the right side of Planner to enter Priority;
- appears against the left/sidebar boundary in Priority to return;
- is not part of Timeline, Marks, or the global student shell.

Its exact routing/state model will be decided when the Priority feature is implemented.

## Implementation principles

- Do not translate Figma groups 1:1 into React components.
- Derive components from responsibility, reuse, behaviour and state ownership.
- Prefer small composable components over route-dependent god components.
- Keep server state in TanStack Query.
- Keep authentication/session state in the existing Zustand store.
- Keep ephemeral presentation state local unless multiple distant components genuinely need it.
- Reuse the existing API wrappers and hooks rather than calling Axios directly from feature components.
- Do not duplicate backend business rules in the frontend.
- Do not invent Canvas data when values are missing.

## Known Figma artefacts

Some MVP frames contain overlapping or legacy design layers. In particular, legacy
navigation material may still refer to `Text` or `graph`.

Rendered MVP behaviour and current product terminology take precedence over those
legacy internal layers.

There is no `Planner | Graph | Timeline` global navigation in the MVP.

## Admin boundary

The existing `/admin/*` interface is architecturally separate from the student UI.

Do not wrap admin routes in `StudentLayout` and do not add student navigation,
sidebar, or Planner/Timeline controls to the admin interface.
