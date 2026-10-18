import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  useAuthStore,
} from '../../stores/authStore'

import {
  usePlanningTree,
} from '../../hooks/usePlanningTree'

import {
  useTimeline,
} from '../../hooks/useTimeline'

import {
  useTimelineUniverse,
} from '../../hooks/useTimelineUniverse'

import {
  updateTimezone,
} from '../../api/planning'

import usePriorityFind from '../planner/hooks/usePriorityFind'

import AnchorDialog from './AnchorDialog'
import TimezonePanel from './TimezonePanel'
import TimelineBoard from './TimelineBoard'
import TimelineTaskNavigator from './TimelineTaskNavigator'
import CreatePlanningItemPanel from '../planner/components/CreatePlanningItemPanel'
import { buildRootLeafIndex, findInitialVisibleRootLeaf, findTreeItemById, stepRootLeaf } from './timelineRootNavigation'
import TimelineSidebar from './TimelineSidebar'
import { classifyTimelineOverdue } from './timelineOverdue'
import TimelineToolbar from './TimelineToolbar'
import useTimelineActions from './useTimelineActions'
import useTimelinePreferences, {
  defaultTimelinePreferences,
} from './useTimelinePreferences'
import useSequenceNavigator from './useSequenceNavigator'

import {
  makeScale,
  shiftDate,
  todayKey,
} from './timelineDates'

import '../planner/components/PriorityPanel.css'
import './Timeline.css'

export default function TimelinePage() {
  const userId =
    useAuthStore(
      (state) =>
        state.user?.id,
    )

  return (
    <TimelineContent
      key={
        userId ??
        'anonymous'
      }
      userId={
        userId
      }
    />
  )
}

function timelineTargetDate(
  item,
) {
  if (
    item?.timeline_pending_display_date
  ) {
    return item.timeline_pending_display_date
  }

  if (
    item?.is_completed &&
    item?.completed_display_date
  ) {
    return item.completed_display_date
  }

  return (
    item?.manual_requested_date ??
    item?.scheduled_date ??
    item?.due_date ??
    item?.start_date ??
    null
  )
}


function buildUniversePaths(
  rows,
) {
  const byId =
    new Map(
      rows.map(
        (row) => [
          row.id,
          row,
        ],
      ),
    )

  const paths =
    new Map()

  for (const row of rows) {
    const path = []
    const seen =
      new Set()

    let parentId =
      row.parent

    while (
      parentId != null &&
      !seen.has(
        parentId,
      )
    ) {
      seen.add(
        parentId,
      )

      const parent =
        byId.get(
          parentId,
        )

      if (!parent) {
        break
      }

      path.unshift({
        id:
          parent.id,

        title:
          parent.title,
      })

      parentId =
        parent.parent
    }

    paths.set(
      row.id,
      path,
    )
  }

  return paths
}


function TimelineContent({
  userId,
}) {
  const [
    anchor,
    setAnchor,
  ] = useState(
    todayKey,
  )

  const [
    options,
    update,
  ] = useTimelinePreferences(
    userId,
  )

  const tree =
    usePlanningTree()

  const roots = useMemo(() => tree.data ?? [], [tree.data])

  const activeRoots = useMemo(() => roots.filter((root) => !root.is_completed), [roots])
  // Effective selection only: persisted preferences and the canonical tree stay intact.
  const selectedRoots = useMemo(
    () => options.roots.filter((id) => activeRoots.some((root) => root.id === id)),
    [activeRoots, options.roots],
  )

  const [overdueActive, setOverdueActive] = useState(false)
  const [overdueSections, setOverdueSections] = useState([])

  const toggleOverdueSection = useCallback((section) => {
    setOverdueSections((current) =>
      current.includes(section)
        ? current.filter((value) => value !== section)
        : [...current, section],
    )
  }, [])

  const [
    timezoneOpen,
    setTimezoneOpen,
  ] = useState(false)

  const [
    anchorRequest,
    setAnchorRequest,
  ] = useState(null)

  const explicitLeafByRoot = useRef(new Map())
  const renderedTaskItems = useRef([])
  const recordRenderedTasks = useCallback((rows) => { renderedTaskItems.current = rows }, [])

  const scrollRef =
    useRef(null)

  const [
    boardWidth,
    setBoardWidth,
  ] = useState(1200)

  const jump =
    useCallback(
      (
        date = todayKey(),
        { rootNavigation = false } = {},
      ) => {
        if (!rootNavigation) explicitLeafByRoot.current.clear()
        setAnchor(date)

        scrollRef.current
          ?.scrollTo({
            top: 0,
            left: 0,
          })
      },
      [],
    )

  const scale =
    useMemo(
      () =>
        makeScale(
          anchor,
          options.zoom,
          boardWidth,
        ),
      [
        anchor,
        options.zoom,
        boardWidth,
      ],
    )

  const visibleDateKeys = useMemo(
    () => scale.columns.flatMap((column) => [column.from, column.to]), [scale],
  )

  const query =
    useTimeline({
      from:
        scale.from,

      to:
        scale.to,
    })

  const actions =
    useTimelineActions()

  const universe =
    useTimelineUniverse()

  const allUniverseItems =
    useMemo(
      () =>
        universe.data ??
        [],
      [
        universe.data,
      ],
    )

  const searchUniverseItems =
    useMemo(
      () =>
        allUniverseItems.filter(
          (item) =>
            (
              options.completed ||
              !item.is_completed
            ) &&
            Boolean(
              timelineTargetDate(
                item,
              ),
            ),
        ),
      [
        allUniverseItems,
        options.completed,
      ],
    )

  const universePaths =
    useMemo(
      () =>
        buildUniversePaths(
          searchUniverseItems,
        ),
      [
        searchUniverseItems,
      ],
    )

  const universeById =
    useMemo(
      () =>
        new Map(
          allUniverseItems.map(
            (item) => [
              item.id,
              item,
            ],
          ),
        ),
      [
        allUniverseItems,
      ],
    )

  const overdueMatches = useMemo(() => {
    if (!overdueActive) return new Set()

    const today = todayKey()
    const sections = overdueSections.length
      ? overdueSections
      : ['anchor', 'deadline']

    return new Set(
      allUniverseItems
        .filter((item) => sections.includes(classifyTimelineOverdue(item, today)))
        .map((item) => item.id),
    )
  }, [allUniverseItems, overdueActive, overdueSections])

  const overdueEntries = useMemo(
    () => searchUniverseItems
      .filter((item) => overdueMatches.has(item.id))
      .map((item) => ({
        id: item.id,
        date: timelineTargetDate(item),
        title: item.title,
      }))
      .filter((entry) => entry.date != null)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id),
    [searchUniverseItems, overdueMatches],
  )

  const rootLeafIndex = useMemo(
    () => buildRootLeafIndex(roots, allUniverseItems, options.completed),
    [roots, allUniverseItems, options.completed],
  )
  const [currentLeafByRoot, setCurrentLeafByRoot] = useState({})
  const [activeNavigatorRootId, setActiveNavigatorRootId] = useState(null)
  const [navigatorVisible, setNavigatorVisible] = useState(false)
  const [navigatorMinimized, setNavigatorMinimized] = useState(false)
  const [navigatorPosition, setNavigatorPosition] = useState(null)
  const [navigationTarget, setNavigationTarget] = useState(null)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const canonicalTreeItem = findTreeItemById(roots, editingTaskId)
  const navigatorRoots = activeRoots.filter(
    (root) => selectedRoots.includes(root.id),
  )

  const globalRootEntries = useMemo(() => {
    const unique = new Map()

    for (const rootId of selectedRoots) {
      for (const entry of rootLeafIndex.get(rootId) ?? []) {
        if (entry.date == null || unique.has(entry.id)) continue
        unique.set(entry.id, entry)
      }
    }

    return [...unique.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
    )
  }, [selectedRoots, rootLeafIndex])

  const find =
    usePriorityFind(
      searchUniverseItems,
      universePaths,
      {
        includePath:
          false,

        onNavigate:
          (item) => {
            const date =
              timelineTargetDate(
                item,
              )

            if (date) {
              jump(date)
            }
          },
      },
    )

  useEffect(() => {
    if (find.query.trim()) setNavigationTarget(null)
  }, [find.query])

  const [
    anchoredActive,
    setAnchoredActive,
  ] = useState(false)

  const overdueSequence = useSequenceNavigator(
    overdueEntries,
    (entry) => {
      if (!entry?.date) return
      setNavigationTarget({ id: entry.id, date: entry.date })
      find.changeQuery('')
      setAnchoredActive(false)
      jump(entry.date)
    },
  )

  useEffect(() => {
    overdueSequence.reset()
  }, [overdueActive, overdueSections])

  const globalRootSequence = useSequenceNavigator(
    globalRootEntries,
    (entry) => {
      if (!entry?.date) return
      setNavigationTarget({ id: entry.id, date: entry.date })
      find.changeQuery('')
      setAnchoredActive(false)
      jump(entry.date, { rootNavigation: true })
    },
  )

  function selectNavigationTask(entry, rootId) {
    if (!entry?.date) return
    setCurrentLeafByRoot((current) => ({ ...current, [rootId]: entry.id }))
    setActiveNavigatorRootId(rootId)
    setNavigationTarget({ id: entry.id, date: entry.date })
    find.changeQuery('')
    setAnchoredActive(false)
    jump(entry.date, { rootNavigation: true })
    explicitLeafByRoot.current.set(rootId, entry.id)
  }

  function navigateRoot(rootId, direction) {
    const next = stepRootLeaf(rootLeafIndex.get(rootId) ?? [], displayCurrentLeafByRoot[rootId], direction)
    if (next) selectNavigationTask(next, rootId)
  }

  function toggleRoot(id) {
    const removing = selectedRoots.includes(id)
    const next = removing ? selectedRoots.filter((root) => root !== id) : [...selectedRoots, id]
    update({ roots: next })
    if (!removing) {
      const initial = findInitialVisibleRootLeaf(rootLeafIndex.get(id) ?? [], renderedTaskItems.current, visibleDateKeys)
      if (initial && !explicitLeafByRoot.current.has(id)) setCurrentLeafByRoot((current) => ({ ...current, [id]: initial.id }))
      setActiveNavigatorRootId(id)
      setNavigatorVisible(true)
    } else {
      explicitLeafByRoot.current.delete(id)
      if (activeNavigatorRootId === id) setActiveNavigatorRootId(next[0] ?? null)
      if (!next.length) setNavigatorVisible(false)
      if ((rootLeafIndex.get(id) ?? []).some((entry) => entry.id === navigationTarget?.id)) setNavigationTarget(null)
    }
  }

  function deselectRoots() {
    explicitLeafByRoot.current.clear()
    update({ roots: [] })
    setNavigatorVisible(false)
    setActiveNavigatorRootId(null)
    setNavigationTarget(null)
  }

  // Reconcile tree refreshes and completion visibility without retaining stale task objects.
  useEffect(() => {
    if (!selectedRoots.length) setNavigatorVisible(false)
    if (!selectedRoots.includes(activeNavigatorRootId)) {
      setActiveNavigatorRootId(selectedRoots[0] ?? null)
    }
    if (navigationTarget && !selectedRoots.some((id) =>
      (rootLeafIndex.get(id) ?? []).some((entry) => entry.id === navigationTarget.id && entry.date != null))) {
      setNavigationTarget(null)
    }
  }, [selectedRoots, activeNavigatorRootId, rootLeafIndex, navigationTarget])

  const anchoredItems =
    useMemo(
      () =>
        allUniverseItems
          .filter(
            (item) =>
              Boolean(
                item.manual_requested_date,
              ),
          )
          .sort(
            (a, b) =>
              a.manual_requested_date
                .localeCompare(
                  b.manual_requested_date,
                ) ||
              a.id -
                b.id,
          ),
      [
        allUniverseItems,
      ],
    )

  const anchoredSequence =
    useSequenceNavigator(
      anchoredItems,
      (item) =>
        jump(
          item.manual_requested_date,
        ),
    )

  const today =
    todayKey()

  const overloadDates =
    useMemo(
      () => {
        const dates =
          new Set(
            query.data
              ?.overload_dates ??
            [],
          )

        for (
          const row
          of (
            query.data
              ?.scheduler
              ?.daily_load ??
            []
          )
        ) {
          if (
            row.status ===
            'overloaded'
          ) {
            dates.add(
              row.scheduled_date,
            )
          }
        }

        return [
          ...dates,
        ]
          .filter(
            (date) =>
              date >= today,
          )
          .sort()
      },
      [
        query.data,
        today,
      ],
    )

  const infeasibleDates =
    useMemo(
      () =>
        (
          query.data
            ?.scheduler
            ?.daily_load ??
          []
        )
          .filter(
            (row) =>
              row.status ===
                'infeasible' &&
              row.scheduled_date >=
                today,
          )
          .map(
            (row) =>
              row.scheduled_date,
          )
          .filter(
            (
              value,
              index,
              rows,
            ) =>
              rows.indexOf(
                value,
              ) === index,
          )
          .sort(),
      [
        query.data,
        today,
      ],
    )

  const [
    overloadActive,
    setOverloadActive,
  ] = useState(false)

  const [
    infeasibleActive,
    setInfeasibleActive,
  ] = useState(false)

  const overloadSequence =
    useSequenceNavigator(
      overloadDates,
      jump,
    )

  const infeasibleSequence =
    useSequenceNavigator(
      infeasibleDates,
      jump,
    )

  function resetTimelineView() {
    // Reset user-facing preferences using the existing persistence mechanism.
    update(defaultTimelinePreferences())

    // Clear search and all temporary navigation modes.
    find.changeQuery('')
    setNavigationTarget(null)

    setOverdueActive(false)
    setOverdueSections([])
    overdueSequence.reset()

    setAnchoredActive(false)
    anchoredSequence.reset()

    setOverloadActive(false)
    overloadSequence.reset()

    setInfeasibleActive(false)
    infeasibleSequence.reset()

    globalRootSequence.reset()

    // Remove transient root-navigation state.
    explicitLeafByRoot.current.clear()
    setCurrentLeafByRoot({})
    setActiveNavigatorRootId(null)
    setNavigatorVisible(false)
    setNavigatorMinimized(false)
    setNavigatorPosition(null)

    // Restore the default date and scroll position.
    jump()
  }

  const navigateWindow =
    useCallback(
      (amount) => {
        jump(
          shiftDate(
            anchor,
            options.zoom,
            amount,
          ),
        )
      },
      [
        anchor,
        options.zoom,
        jump,
      ],
    )

  useEffect(() => {
    function handleKey(event) {
      const target =
        event.target

      if (
        target instanceof
          HTMLInputElement ||
        target instanceof
          HTMLTextAreaElement ||
        target instanceof
          HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return
      }

      if (target instanceof Element && target.closest('.timeline-task-navigator')) {
        return
      }

      if (
        event.key ===
          'ArrowRight' ||
        event.key === '>'
      ) {
        event.preventDefault()
        navigateWindow(1)
      }

      if (
        event.key ===
          'ArrowLeft' ||
        event.key === '<'
      ) {
        event.preventDefault()
        navigateWindow(-1)
      }
    }

    window.addEventListener(
      'keydown',
      handleKey,
    )

    return () =>
      window.removeEventListener(
        'keydown',
        handleKey,
      )

  }, [
    navigateWindow,
  ])

  const allItems =
    useMemo(
      () =>
        (
          query.data?.groups ??
          []
        ).flatMap(
          (group) =>
            group.items.map(
              (item) => ({
                ...item,
                root:
                  group.root,
              }),
            ),
        ),
      [
        query.data,
      ],
    )

  const filteredItems =
    useMemo(
      () =>
        allItems
          .filter(
            (item) =>
              (!overdueActive || overdueMatches.has(item.id)) &&
              (
              (navigationTarget?.id === item.id && (options.completed || !item.is_completed)) ||
              (find.query.trim()
                ? find.matchIds.has(
                    item.id,
                  )
                : (
                    (
                      anchoredActive &&
                      anchoredItems.some(
                        (anchored) =>
                          anchored.id ===
                          item.id,
                      )
                    ) ||
                    (
                      (
                        options.completed ||
                        !item.is_completed
                      ) &&
                    (
                      options.type ===
                        'all' ||
                      item.item_type ===
                        (
                          options.type ===
                          'assignments'
                            ? 'ASSIGNMENT'
                            : 'TASK'
                        )
                    ) &&
                    (
                      options.durations ??
                      []
                    ).includes(
                      item.duration_category,
                    ) &&
                    (
                      !selectedRoots.length ||
                      selectedRoots.includes(
                        item.root.id,
                      )
                    )
                  )
                ))
              ),
          )
          .sort(
            (a, b) =>
              (
                a.scheduled_date ??
                '9999'
              ).localeCompare(
                b.scheduled_date ??
                '9999',
              ) ||
              (
                a.priority_position ??
                Infinity
              ) -
                (
                  b.priority_position ??
                  Infinity
                ) ||
              a.id -
                b.id,
          ),
      [
        allItems,
        navigationTarget,
        options,
        selectedRoots,
        find.query,
        find.matchIds,
        anchoredActive,
        anchoredItems,
        overdueActive,
        overdueMatches,
      ],
    )

  /*
   * V1 gives the frontend exact per-session allocations.
   * Materialize them as visual cards while keeping one canonical task id.
   */
  const items =
    useMemo(
      () => {
        const byItem =
          new Map()

        for (
          const row
          of (
            query.data
              ?.scheduler
              ?.allocations ??
            []
          )
        ) {
          if (
            !byItem.has(
              row.item_id,
            )
          ) {
            byItem.set(
              row.item_id,
              [],
            )
          }

          byItem
            .get(
              row.item_id,
            )
            .push(row)
        }

        return filteredItems
          .flatMap(
            (item) => {
              const sessions =
                byItem.get(
                  item.id,
                )

              if (
                !sessions?.length
              ) {
                const pendingReopenDisplayDate =
                  !item.is_completed &&
                  !item.scheduled_date
                    ? (
                        item.timeline_pending_display_date ??
                        null
                      )
                    : null

                const completedDisplayDate =
                  item.is_completed &&
                  options.completed &&
                  !item.scheduled_date
                    ? (
                        item.completed_display_date ??
                        item.manual_requested_date ??
                        item.due_date ??
                        item.start_date ??
                        null
                      )
                    : null

                return [{
                  ...item,

                  scheduled_date:
                    item.scheduled_date ??
                    pendingReopenDisplayDate ??
                    completedDisplayDate,

                  timeline_display_only_date:
                    Boolean(
                      pendingReopenDisplayDate ||
                      completedDisplayDate,
                    ),

                  timeline_reopen_pending:
                    Boolean(
                      pendingReopenDisplayDate,
                    ),

                  show_constraints:
                    true,
                }]
              }

              return sessions
                .slice()
                .sort(
                  (a, b) =>
                    a.scheduled_date
                      .localeCompare(
                        b.scheduled_date,
                      ) ||
                    a.execution_rank -
                      b.execution_rank,
                )
                .map(
                  (
                    session,
                    index,
                  ) => ({
                    ...item,

                    render_id:
                      `${item.id}:` +
                      `${session.scheduled_date}:` +
                      `${session.execution_rank}`,

                    scheduled_date:
                      session.scheduled_date,

                    execution_rank:
                      session.execution_rank,

                    session_hours:
                      session.hours,

                    session_percentage:
                      session.percentage,

                    session_index:
                      index,

                    session_count:
                      sessions.length,

                    show_constraints:
                      index === 0,
                  }),
                )
            },
          )
      },
      [
        filteredItems,
        options.completed,
        query.data
          ?.scheduler
          ?.allocations,
      ],
    )

  // Board reports its concentrated, date-visible cards in a ref, never canonical state.
  // Keep explicit arrow/list targets stable while the async date query refreshes.
  useEffect(() => {
    setCurrentLeafByRoot((current) => {
      let next = current
      for (const rootId of selectedRoots) {
        const entries = rootLeafIndex.get(rootId) ?? []
        const explicitId = explicitLeafByRoot.current.get(rootId)
        if (entries.some((entry) => entry.id === explicitId && entry.date != null)) continue
        const initial = findInitialVisibleRootLeaf(entries, renderedTaskItems.current, visibleDateKeys)
        if (initial && current[rootId] !== initial.id) {
          if (next === current) next = { ...current }
          next[rootId] = initial.id
        }
      }
      return next
    })
  }, [selectedRoots, rootLeafIndex, visibleDateKeys, items])

  const displayCurrentLeafByRoot = { ...currentLeafByRoot }
  for (const rootId of selectedRoots) {
    const entries = rootLeafIndex.get(rootId) ?? []
    if (!entries.some((entry) => entry.date != null && entry.id === displayCurrentLeafByRoot[rootId])) {
      const initial = findInitialVisibleRootLeaf(entries, items, visibleDateKeys)
      if (initial) displayCurrentLeafByRoot[rootId] = initial.id
    }
  }

  const boardFind =
    useMemo(
      () => {
        const matchIds =
          new Set(
            find.matchIds,
          )

        if (
          anchoredActive
        ) {
          for (
            const item
            of anchoredItems
          ) {
            matchIds.add(
              item.id,
            )
          }
        }

        for (const id of overdueMatches) matchIds.add(id)

        if (navigationTarget) matchIds.add(navigationTarget.id)
        return {
          ...find,
          currentId: navigationTarget?.id ?? find.currentId,
          matchIds,
        }
      },
      [
        find,
        navigationTarget,
        anchoredActive,
        anchoredItems,
        overdueMatches,
      ],
    )

  useEffect(() => {
    if (!navigationTarget || query.isPending) return
    // Wait for Board's concentration reset and the new query's cards to commit.
    const frame = requestAnimationFrame(() => {
      const container = scrollRef.current
      const card = container?.querySelector(`[data-timeline-task-id="${navigationTarget.id}"]`)
      if (!card) return
      // Scroll only the board; never move document scroll or input/dialog focus.
      const bounds = container.getBoundingClientRect()
      const rect = card.getBoundingClientRect()
      const axisHeight = container.querySelector('.timeline-axis')?.getBoundingClientRect().height ?? 0
      const top = bounds.top + axisHeight
      const dy = rect.top < top ? rect.top - top : rect.bottom > bounds.bottom ? rect.bottom - bounds.bottom : 0
      const dx = rect.left < bounds.left ? rect.left - bounds.left : rect.right > bounds.right ? rect.right - bounds.right : 0
      if (dx || dy) container.scrollTo({ top: container.scrollTop + dy, left: container.scrollLeft + dx })
    })
    return () => cancelAnimationFrame(frame)
  }, [navigationTarget, items, query.isPending])

  const dateHighlights =
    useMemo(
      () => ({
        overloadActive,
        infeasibleActive,

        overloadDates:
          new Set(
            overloadDates,
          ),

        infeasibleDates:
          new Set(
            infeasibleDates,
          ),
      }),
      [
        overloadActive,
        infeasibleActive,
        overloadDates,
        infeasibleDates,
      ],
    )

  return (
    <div className="timeline-page">
      <TimelineSidebar
        roots={activeRoots}
        selected={
          selectedRoots
        }
        loading={
          tree.isPending
        }
        error={
          tree.isError
        }
        retry={() =>
          tree.refetch()
        }
        toggle={toggleRoot}
        navigatorVisible={navigatorVisible}
        toggleNavigatorPanel={() => {
          if (selectedRoots.length) {
            setNavigatorVisible((visible) => !visible)
          }
        }}
        rootLeafIndex={rootLeafIndex}
        currentLeafByRoot={displayCurrentLeafByRoot}
        navigateRoot={navigateRoot}
        deselectRoots={deselectRoots}
        overdueActive={overdueActive}
        overdueSections={overdueSections}
        toggleOverdue={() => {
          setOverdueActive((current) => !current)
          setOverdueSections([])
        }}
        toggleOverdueSection={toggleOverdueSection}
        overdueNavigation={{
          count: overdueEntries.length,
          index: overdueSequence.index,
          navigate: overdueSequence.navigate,
        }}
        schedulerRuntime={
          query.data?.scheduler
        }
        actions={
          actions
        }
      />

      <h1 className="sr-only">
        Timeline
      </h1>

      <div className="timeline-toolbar-stack">
      <TimelineToolbar
        find={find}
        actions={actions}
        anchor={anchor}
        zoom={
          options.zoom
        }
        setZoom={(value) =>
          update({
            zoom:
              value,
          })
        }
        navigate={
          navigateWindow
        }
        jump={jump}
        onReset={resetTimelineView}
        options={options}
        update={update}
        anchorNav={{
          active:
            anchoredActive,

          count:
            anchoredItems.length,

          index:
            anchoredSequence.index,

          toggle() {
            if (
              anchoredActive
            ) {
              setAnchoredActive(false)
              anchoredSequence.reset()
            } else {
              setAnchoredActive(true)
              anchoredSequence.activate()
            }
          },

          navigate:
            anchoredSequence.navigate,
        }}
        overloadNav={{
          active:
            overloadActive,

          count:
            overloadDates.length,

          index:
            overloadSequence.index,

          toggle() {
            if (
              overloadActive
            ) {
              setOverloadActive(false)
              overloadSequence.reset()
            } else {
              setOverloadActive(true)
              overloadSequence.activate()
            }
          },

          navigate:
            overloadSequence.navigate,
        }}
        infeasibleNav={{
          active:
            infeasibleActive,

          count:
            infeasibleDates.length,

          index:
            infeasibleSequence.index,

          toggle() {
            if (
              infeasibleActive
            ) {
              setInfeasibleActive(false)
              infeasibleSequence.reset()
            } else {
              setInfeasibleActive(true)
              infeasibleSequence.activate()
            }
          },

          navigate:
            infeasibleSequence.navigate,
        }}
        onEditTimezones={() =>
          setTimezoneOpen(true)
        }
      />

      {actions.error && (
        <p
          className="
            timeline-message
            timeline-error
          "
          role="alert"
        >
          {actions.error}
        </p>
      )}

      {timezoneOpen && (
        <TimezonePanel
          onClose={() =>
            setTimezoneOpen(
              false,
            )
          }
        />
      )}
      </div>

      {query.isPending ? (
        <p
          className="timeline-message"
          role="status"
        >
          Loading Timeline…
        </p>
      ) : query.isError ? (
        <p
          className="
            timeline-message
            timeline-error
          "
          role="alert"
        >
          Timeline could not load.

          {' '}

          <button
            onClick={() =>
              query.refetch()
            }
          >
            Retry
          </button>
        </p>
      ) : (
        <>
          {query.data.conflicts?.length > 0 && (
            <details className="timeline-message">
              <summary>
                {
                  query.data
                    .conflicts
                    .length
                } scheduling issue(s)
              </summary>

              <ul>
                {query.data.conflicts.map(
                  (conflict) => (
                    <li
                      key={
                        conflict.item_id +
                        conflict.code
                      }
                    >
                      {
                        universeById.get(
                          conflict.item_id,
                        )?.title ??
                        allItems.find(
                          (item) =>
                            item.id ===
                            conflict.item_id,
                        )?.title ??
                        (
                          'Item ' +
                          conflict.item_id
                        )
                      }

                      {': '}

                      {
                        conflict.code
                          .replaceAll(
                            '_',
                            ' ',
                          )
                      }
                    </li>
                  ),
                )}
              </ul>
            </details>
          )}

          {!items.length && (
            <p className="timeline-message">
              No visible items in this range. Change dates or filters.
            </p>
          )}

          <div
            className="timeline-board-host"
          >
            <TimelineBoard
              onEditTask={setEditingTaskId}
              navigationTarget={navigationTarget}
              onVisibleTaskItemsChange={recordRenderedTasks}
              scale={scale}
              items={items}
              data={
                query.data
              }
              grouped={
                options.grouped
              }
              find={
                boardFind
              }
              actions={actions}
              dateHighlights={
                dateHighlights
              }
              scrollRef={
                scrollRef
              }
              onRequestAnchor={(
                item,
                date,
              ) =>
                setAnchorRequest({
                  item,
                  date,
                })
              }
              onEditTimezones={() =>
                setTimezoneOpen(
                  true,
                )
              }
              onRenameTimezone={async (
                zone,
                title,
              ) => {
                await updateTimezone(
                  zone.id,
                  {
                    title,
                    start_date:
                      zone.start_date,
                    end_date:
                      zone.end_date,
                  },
                )

                await query.refetch()
              }}
              onViewportWidth={
                setBoardWidth
              }
              fitViewport
            />
          </div>
        </>
      )}

      {navigatorVisible && navigatorRoots.length > 0 && (
        <TimelineTaskNavigator
          selectedRoots={navigatorRoots} rootLeafIndex={rootLeafIndex}
          globalNavigation={{
            count: globalRootEntries.length,
            index: globalRootSequence.index,
            navigate: globalRootSequence.navigate,
          }}
          activeRootId={activeNavigatorRootId} currentLeafByRoot={displayCurrentLeafByRoot}
          navigateRoot={navigateRoot}
          minimized={navigatorMinimized} onSetMinimized={setNavigatorMinimized}
          onSetActiveRoot={setActiveNavigatorRootId} onSelectTask={selectNavigationTask}
          onClose={() => setNavigatorVisible(false)}
          position={navigatorPosition} setPosition={setNavigatorPosition}
        />
      )}
      {editingTaskId != null && (
        <div className="timeline-task-editor fixed right-0 top-1/2 z-40 -translate-y-1/2">
          {canonicalTreeItem ? (
            <CreatePlanningItemPanel key={editingTaskId} editingItem={canonicalTreeItem}
              onClose={() => setEditingTaskId(null)} onUpdated={() => setEditingTaskId(null)} />
          ) : (
            <div role="status">
              {tree.isPending ? 'Loading task…' : 'Task is unavailable in the planning tree.'}
              <button type="button" onClick={() => setEditingTaskId(null)}>Close task panel</button>
            </div>
          )}
        </div>
      )}
      {anchorRequest && (
        <AnchorDialog
          key={
            (
              anchorRequest
                .item
                ?.id ??
              'item'
            ) +
            ':' +
            (
              anchorRequest
                .date ??
              ''
            )
          }
          request={
            anchorRequest
          }
          actions={actions}
          onClose={() =>
            setAnchorRequest(
              null,
            )
          }
        />
      )}
    </div>
  )
}
