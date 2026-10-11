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

import SchedulerPanel from './SchedulerPanel'
import AnchorDialog from './AnchorDialog'
import TimezonePanel from './TimezonePanel'
import TimelineBoard from './TimelineBoard'
import TimelineSidebar from './TimelineSidebar'
import TimelineToolbar from './TimelineToolbar'
import useTimelineActions from './useTimelineActions'
import useTimelinePreferences from './useTimelinePreferences'
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

  const roots =
    tree.data ?? []

  const selectedRoots =
    useMemo(
      () =>
        tree.data
          ? options.roots.filter(
              (id) =>
                tree.data.some(
                  (root) =>
                    root.id ===
                    id,
                ),
            )
          : options.roots,
      [
        tree.data,
        options.roots,
      ],
    )

  const [
    settingsOpen,
    setSettingsOpen,
  ] = useState(false)

  const [
    timezoneOpen,
    setTimezoneOpen,
  ] = useState(false)

  const [
    anchorRequest,
    setAnchorRequest,
  ] = useState(null)

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
      ) => {
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

  const [
    anchoredActive,
    setAnchoredActive,
  ] = useState(false)

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
              find.query.trim()
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
        options,
        selectedRoots,
        find.query,
        find.matchIds,
        anchoredActive,
        anchoredItems,
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

        return {
          ...find,
          matchIds,
        }
      },
      [
        find,
        anchoredActive,
        anchoredItems,
      ],
    )

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
        roots={roots}
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
        toggle={(id) =>
          update({
            roots:
              selectedRoots.includes(
                id,
              )
                ? selectedRoots.filter(
                    (root) =>
                      root !==
                      id,
                  )
                : [
                    ...selectedRoots,
                    id,
                  ],
          })
        }
        schedulerRuntime={
          query.data?.scheduler
        }
        actions={
          actions
        }
      />

      <h1 className="timeline-heading arc-display">
        Timeline
      </h1>

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
        options={options}
        update={update}
        settingsOpen={
          settingsOpen
        }
        toggleSettings={() =>
          setSettingsOpen(
            (value) =>
              !value,
          )
        }
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

      {settingsOpen && (
        <SchedulerPanel
          runtime={
            query.data
              ?.scheduler
          }
          close={() =>
            setSettingsOpen(
              false,
            )
          }
        />
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
