import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import {
  TriangleAlert,
} from 'lucide-react'

import {
  addDays,
  colourZones,
  concentratedItems,
  dateAtPosition,
  inRange,
  intervalGeometry,
  isPersistentConcentration,
  packLanes,
  packTaskLanes,
  parseDate,
  TASK_CARD_COLLISION_WIDTH,
  todayKey,
} from './timelineDates'

import TimelineCard from './TimelineCard'
import useHoverIntent from './useHoverIntent'
import {
  hasTimelineDragItem,
  readTimelineDragItem,
} from '../../dnd/timeline/timelineDragPayload'
import {
  projectTimelineDrop,
} from '../../dnd/timeline/timelineProjection'

function Constraint({
  item,
  geometry,
  scale,
  find,
  actions,
  flat,
  onAnchor,
}) {
  const {
    constraint,
    markers,
    card,
  } = geometry

  const [
    previewX,
    setPreviewX,
  ] = useState(null)

  const hoverTimer =
    useRef(null)

  const pendingX =
    useRef(null)

  function cursorX(event) {
    return (
      event.clientX -
      event.currentTarget
        .getBoundingClientRect()
        .left
    )
  }

  function queuePreview(event) {
    pendingX.current =
      cursorX(event)

    if (
      hoverTimer.current
    ) {
      clearTimeout(
        hoverTimer.current,
      )
    }

    hoverTimer.current =
      setTimeout(
        () => {
          setPreviewX(
            pendingX.current ??
            0,
          )
        },
        180,
      )
  }

  function movePreview(event) {
    pendingX.current =
      cursorX(event)

    if (
      previewX !== null
    ) {
      setPreviewX(
        pendingX.current,
      )
    }
  }

  function closePreview() {
    if (
      hoverTimer.current
    ) {
      clearTimeout(
        hoverTimer.current,
      )

      hoverTimer.current =
        null
    }

    pendingX.current =
      null

    setPreviewX(null)
  }

  const safeUrl =
    /^https?:\/\//i.test(
      item.submission_url ??
      '',
    )
      ? item.submission_url
      : null

  const previewLeft =
    previewX == null
      ? (
          Math.max(
            0,
            Math.min(
              constraint?.left ??
                0,
              scale.width -
                TASK_CARD_COLLISION_WIDTH,
            ),
          ) -
          (
            constraint?.left ??
            0
          )
        )
      : Math.max(
          -(
            constraint?.left ??
            0
          ),
          Math.min(
            previewX + 12,
            scale.width -
              TASK_CARD_COLLISION_WIDTH -
              (
                constraint?.left ??
                0
              ),
          ),
        )

  return (
    <div className="timeline-constraints">
      {constraint && (
        <span
          className="timeline-constraint-line"
          style={
            constraint
          }
        />
      )}

      {markers
        .filter(
          ({ popped }) =>
            !popped,
        )
        .map(
          ({
            field,
            x,
          }) => {
            const release =
              field ===
              'start_date'

            const Tag =
              !release &&
              safeUrl
                ? 'a'
                : 'span'

            return (
              <Tag
                key={field}
                className={
                  'timeline-marker ' +
                  (
                    release
                      ? 'timeline-release'
                      : 'timeline-due'
                  )
                }
                style={{
                  left: x,
                }}
                title={
                  (
                    release
                      ? 'Release: '
                      : 'Due: '
                  ) +
                  item[field]
                }
                role={
                  Tag === 'span'
                    ? 'img'
                    : undefined
                }
                aria-label={
                  (
                    release
                      ? 'Release: '
                      : 'Due: '
                  ) +
                  item[field] +
                  (
                    Tag === 'a'
                      ? ' · Open submission in new tab'
                      : ''
                  )
                }
                {...(
                  Tag === 'a'
                    ? {
                        href:
                          safeUrl,

                        target:
                          '_blank',

                        rel:
                          'noopener noreferrer',
                      }
                    : {}
                )}
              />
            )
          },
        )}

      {!card &&
        constraint &&
        item.show_constraints !== false && (
          <div
            className="timeline-constraint-preview"
            tabIndex={0}
            aria-label={
              'Preview ' +
              item.title
            }
            style={{
              left:
                constraint.left,

              width:
                Math.max(
                  1,
                  constraint.width,
                ),
            }}
            onPointerEnter={
              queuePreview
            }
            onPointerMove={
              movePreview
            }
            onPointerLeave={
              closePreview
            }
            onFocus={() =>
              setPreviewX(
                Math.max(
                  0,
                  (
                    constraint.width -
                    TASK_CARD_COLLISION_WIDTH
                  ) /
                  2,
                ),
              )
            }
            onBlur={
              closePreview
            }
          >
            {previewX !== null && (
              <div
                className="timeline-preview-card"
                style={{
                  left:
                    previewLeft,
                }}
              >
                <TimelineCard
                  item={item}
                  find={find}
                  actions={actions}
                  flat={flat}
                  readOnly
                  onAnchor={
                    onAnchor
                  }
                />
              </div>
            )}
          </div>
        )}
    </div>
  )
}

export default function TimelineBoard({
  scale,
  items,
  data,
  grouped,
  find,
  actions,
  scrollRef,
  onRequestAnchor,
  onEditTimezones,
  onRenameTimezone,
  onViewportWidth,
  dateHighlights,
}) {
  const [
    previewColumn,
    setPreviewColumn,
  ] = useState(null)

  const [
    selectedColumn,
    setSelectedColumn,
  ] = useState(null)

  const dateHover =
    useHoverIntent({
      delay: 150,

      onEnter:
        (column) =>
          setPreviewColumn(
            column,
          ),

      onLeave:
        () =>
          setPreviewColumn(
            null,
          ),
    })

  const [
    editingZoneId,
    setEditingZoneId,
  ] = useState(null)

  const [
    editingZoneTitle,
    setEditingZoneTitle,
  ] = useState('')

  function beginZoneRename(
    zone,
  ) {
    setEditingZoneId(
      zone.id,
    )

    setEditingZoneTitle(
      zone.title,
    )
  }

  async function finishZoneRename(
    zone,
  ) {
    const title =
      editingZoneTitle.trim()

    setEditingZoneId(null)

    if (
      !title ||
      title === zone.title
    ) {
      return
    }

    try {
      await onRenameTimezone?.(
        zone,
        title,
      )
    } catch {
      // TimelinePage owns the API boundary. If saving fails, the next
      // authoritative Timeline refresh restores the persisted title.
    }
  }

  useLayoutEffect(() => {
    const node =
      scrollRef.current

    if (
      !node ||
      !onViewportWidth
    ) {
      return undefined
    }

    const report = () => {
      const width =
        Math.floor(
          node.clientWidth,
        )

      if (
        width > 0
      ) {
        onViewportWidth(
          width,
        )
      }
    }

    report()

    const observer =
      new ResizeObserver(
        report,
      )

    observer.observe(node)

    return () =>
      observer.disconnect()

  }, [
    scrollRef,
    onViewportWidth,
  ])

  const handleColumnClick =
    useCallback(
      (column) => {
        setSelectedColumn(
          (current) =>
            current?.from ===
              column.from &&
            current?.to ===
              column.to
              ? null
              : column,
        )
      },
      [],
    )

  const visibleItems =
    concentratedItems(
      items,
      previewColumn,
      selectedColumn,
    )

  const persistentConcentration =
    isPersistentConcentration(
      previewColumn,
      selectedColumn,
    )

  const rootGroups =
    new Map()

  for (
    const item
    of visibleItems
  ) {
    if (
      !rootGroups.has(
        item.root.id,
      )
    ) {
      rootGroups.set(
        item.root.id,
        [],
      )
    }

    rootGroups
      .get(item.root.id)
      .push(item)
  }

  const groups =
    grouped
      ? [
          ...rootGroups.values(),
        ]
      : [visibleItems]

  const {
    assignments:
      rangeAssignments,

    laneCount,
  } = packLanes(
    data.timezones ?? [],
    scale,
  )

  const dailyLoad =
    new Map(
      (
        data.scheduler
          ?.daily_load ??
        []
      ).map(
        (row) => [
          row.scheduled_date,
          row,
        ],
      ),
    )

  const explicitlyOverloaded =
    new Set(
      data.overload_dates ??
      [],
    )

  const today =
    todayKey()

  const todayDow =
    (
      parseDate(
        today,
      ).getUTCDay() +
      6
    ) %
    7

  const currentWeek =
    scale.columns.every(
      (column) =>
        column.from ===
        column.to,
    )
      ? intervalGeometry(
          addDays(
            today,
            -todayDow,
          ),
          addDays(
            today,
            6 - todayDow,
          ),
          scale,
          'end',
        )
      : null

  function handleDrop(event) {
    const itemId =
      readTimelineDragItem(
        event.dataTransfer,
      )

    if (
      itemId === null
    ) {
      return
    }

    event.preventDefault()

    const item =
      items.find(
        (row) =>
          row.id ===
          itemId,
      )

    if (!item) {
      return
    }

    const rect =
      event.currentTarget
        .getBoundingClientRect()

    const intent =
      projectTimelineDrop({
        clientX:
          event.clientX,

        boardLeft:
          rect.left,

        scale,

        dateAtPosition,
      })

    onRequestAnchor?.(
      item,
      intent.date,
    )
  }

  return (
    <div
      className="timeline-scroll"
      ref={scrollRef}
      tabIndex={0}
      aria-label="Timeline"
    >
      <div
        className="timeline-board"
        style={{
          width:
            scale.width,

          '--timeline-column':
            scale.columnWidth +
            'px',

          '--timeline-width':
            scale.width +
            'px',
        }}
        onDragOver={(event) => {
          if (
            hasTimelineDragItem(
              event.dataTransfer,
            )
          ) {
            event.preventDefault()
          }
        }}
        onDrop={
          handleDrop
        }
      >
        <div
          className="timeline-axis"
          style={{
            width:
              scale.width,
          }}
        >
          {scale.columns.map(
            (column) => {
              const load =
                column.from ===
                column.to
                  ? dailyLoad.get(
                      column.from,
                    )
                  : null

              const overloaded =
                column.from >= today &&
                column.from ===
                  column.to &&
                (
                  load?.status ===
                    'overloaded' ||
                  explicitlyOverloaded.has(
                    column.from,
                  )
                )

              const infeasible =
                column.from >= today &&
                column.from ===
                  column.to &&
                load?.status ===
                  'infeasible'

              const statusMatch =
                (
                  dateHighlights
                    ?.overloadActive &&
                  dateHighlights
                    .overloadDates
                    ?.has(
                      column.from,
                    )
                ) ||
                (
                  dateHighlights
                    ?.infeasibleActive &&
                  dateHighlights
                    .infeasibleDates
                    ?.has(
                      column.from,
                    )
                )

              return (
                <button
                  type="button"
                  className={
                    'timeline-date ' +
                    (
                      inRange(
                        todayKey(),
                        column,
                      )
                        ? 'timeline-current-date '
                        : ''
                    ) +
                    (
                      statusMatch
                        ? 'timeline-date-status-highlight '
                        : ''
                    )
                  }
                  key={
                    column.from
                  }
                  onMouseEnter={() =>
                    dateHover.enter(
                      column,
                    )
                  }
                  onMouseLeave={() =>
                    dateHover.leave(
                      column,
                    )
                  }
                  onFocus={() =>
                    setPreviewColumn(
                      column,
                    )
                  }
                  onBlur={() =>
                    setPreviewColumn(
                      null,
                    )
                  }
                  onClick={() =>
                    handleColumnClick(
                      column,
                    )
                  }
                  aria-pressed={
                    selectedColumn?.from ===
                      column.from &&
                    selectedColumn?.to ===
                      column.to
                  }
                  title={
                    'Focus ' +
                    column.title +
                    ' ' +
                    column.subtitle
                  }
                >
                  <strong>
                    {column.title}
                  </strong>

                  <span>
                    {column.subtitle}
                  </span>

                  {overloaded && (
                    <span
                      className="timeline-date-overloaded"
                      title={
                        load
                          ? (
                              `${load.hours}h · overloaded`
                            )
                          : 'Overload allowed'
                      }
                      aria-label="Overloaded date"
                    />
                  )}

                  {infeasible && (
                    <TriangleAlert
                      className="timeline-date-infeasible"
                      size={14}
                      aria-label="Infeasible date"
                    />
                  )}
                </button>
              )
            },
          )}
        </div>

        <div
          className="timeline-current-week-strip"
          aria-label="Current week"
        >
          {currentWeek && (
            <span
              style={{
                left:
                  currentWeek.left,

                width:
                  currentWeek.width,
              }}
            />
          )}
        </div>

        <div
          className="timeline-status-guides"
          aria-hidden="true"
        >
          {scale.columns.map(
            (
              column,
              index,
            ) => {
              const active =
                (
                  dateHighlights
                    ?.overloadActive &&
                  dateHighlights
                    .overloadDates
                    ?.has(
                      column.from,
                    )
                ) ||
                (
                  dateHighlights
                    ?.infeasibleActive &&
                  dateHighlights
                    .infeasibleDates
                    ?.has(
                      column.from,
                    )
                )

              return active
                ? (
                    <span
                      key={
                        column.from
                      }
                      style={{
                        left:
                          index *
                          scale.columnWidth,
                      }}
                    />
                  )
                : null
            },
          )}
        </div>

        <div className="timeline-zone-shell">
          {laneCount > 0 && (
            <div className="timeline-zone-lanes">
              {colourZones(
                rangeAssignments,
                scale,
              ).map(
                ({
                  zone,
                  lane,
                  colour,
                }) => {
                  const interval =
                    intervalGeometry(
                      zone.start_date,
                      zone.end_date,
                      scale,
                      'end',
                    )

                  return (
                    interval && (
                      <div
                        className="timeline-zone"
                        data-colour={
                          colour
                        }
                        key={
                          zone.id
                        }
                        style={{
                          width:
                            interval.width,

                          marginLeft:
                            interval.left,

                          gridRow:
                            lane + 1,
                        }}
                        title={
                          `${zone.title}: ` +
                          `${zone.start_date} – ` +
                          `${zone.end_date}`
                        }
                        aria-label={
                          `${zone.title}: ` +
                          `${zone.start_date} – ` +
                          `${zone.end_date}. ` +
                          'Command-click to manage. ' +
                          'Double-click to rename.'
                        }
                        onClick={(event) => {
                          if (
                            event.metaKey ||
                            event.ctrlKey
                          ) {
                            event.preventDefault()
                            event.stopPropagation()
                            onEditTimezones?.()
                          }
                        }}
                        onDoubleClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()

                          beginZoneRename(
                            zone,
                          )
                        }}
                      >
                        {
                          editingZoneId ===
                          zone.id
                            ? (
                                <input
                                  autoFocus
                                  className="timeline-zone-title-input"
                                  value={
                                    editingZoneTitle
                                  }
                                  onChange={(event) =>
                                    setEditingZoneTitle(
                                      event.target.value,
                                    )
                                  }
                                  onBlur={() =>
                                    finishZoneRename(
                                      zone,
                                    )
                                  }
                                  onClick={(event) =>
                                    event.stopPropagation()
                                  }
                                  onDoubleClick={(event) =>
                                    event.stopPropagation()
                                  }
                                  onKeyDown={(event) => {
                                    if (
                                      event.key ===
                                      'Enter'
                                    ) {
                                      event.currentTarget
                                        .blur()
                                    }

                                    if (
                                      event.key ===
                                      'Escape'
                                    ) {
                                      setEditingZoneId(
                                        null,
                                      )
                                    }
                                  }}
                                  aria-label={
                                    `Rename ${zone.title}`
                                  }
                                />
                              )
                            : (
                                <span className="timeline-zone-label">
                                  {zone.title}
                                </span>
                              )
                        }
                      </div>
                    )
                  )
                },
              )}
            </div>
          )}
        </div>

        {groups
          .filter(
            (group) =>
              group.length,
          )
          .map(
            (group) => {
              const lanes =
                packTaskLanes(
                  group,
                  scale,
                  {
                    /*
                     * Execution cards belong to the START boundary of their
                     * scheduled date column. Never centre or shift them left
                     * merely to keep the full card inside the viewport.
                     *
                     * This keeps the visual contract:
                     *
                     * date line | task card -------->
                     */
                    centerDates:
                      false,

                    clampCards:
                      false,
                  },
                )

              if (
                !lanes.length
              ) {
                return null
              }

              return (
                <section
                  key={
                    grouped
                      ? group[0]
                          .root.id
                      : 'flat'
                  }
                >
                  {grouped && (
                    <h2 className="timeline-root">
                      {
                        group[0]
                          .root.title
                      }
                    </h2>
                  )}

                  {lanes.map(
                    (
                      lane,
                      index,
                    ) => (
                      <div
                        className={
                          lane.some(
                            ({
                              geometry,
                            }) =>
                              geometry
                                .markers
                                .some(
                                  ({
                                    popped,
                                  }) =>
                                    popped,
                                ),
                          )
                            ? 'timeline-row timeline-row-constrained'
                            : 'timeline-row'
                        }
                        key={
                          index
                        }
                      >
                        {lane.map(
                          ({
                            item,
                            geometry,
                          }) => (
                            <div
                              className={
                                'timeline-task ' +
                                (
                                  item.is_completed
                                    ? 'timeline-completed '
                                    : ''
                                ) +
                                (
                                  (
                                    dateHighlights
                                      ?.overloadActive &&
                                    dateHighlights
                                      .overloadDates
                                      ?.has(
                                        item.scheduled_date,
                                      )
                                  ) ||
                                  (
                                    dateHighlights
                                      ?.infeasibleActive &&
                                    dateHighlights
                                      .infeasibleDates
                                      ?.has(
                                        item.scheduled_date,
                                      )
                                  )
                                    ? 'timeline-status-task-highlight '
                                    : ''
                                )
                              }
                              key={
                                item.render_id ??
                                item.id
                              }
                            >
                              {
                                item.show_constraints !==
                                false &&
                                (
                                  <Constraint
                                    item={
                                      item
                                    }
                                    geometry={
                                      geometry
                                    }
                                    scale={
                                      scale
                                    }
                                    find={
                                      find
                                    }
                                    actions={
                                      actions
                                    }
                                    flat={
                                      !grouped
                                    }
                                    onAnchor={(
                                      row,
                                    ) =>
                                      onRequestAnchor?.(
                                        row,
                                      )
                                    }
                                  />
                                )
                              }

                              {geometry.card && (
                                <div
                                  className="timeline-card-position"
                                  style={{
                                    left:
                                      geometry
                                        .card
                                        .left,
                                  }}
                                >
                                  <TimelineCard
                                    item={
                                      item
                                    }
                                    find={
                                      find
                                    }
                                    actions={
                                      actions
                                    }
                                    flat={
                                      !grouped
                                    }
                                    expanded={
                                      persistentConcentration
                                    }
                                    onAnchor={(
                                      row,
                                    ) =>
                                      onRequestAnchor?.(
                                        row,
                                      )
                                    }
                                  />

                                  {geometry
                                    .markers
                                    .filter(
                                      ({
                                        popped,
                                      }) =>
                                        popped,
                                    )
                                    .map(
                                      ({
                                        field,
                                        x,
                                      }) => {
                                        const release =
                                          field ===
                                          'start_date'

                                        const safeUrl =
                                          /^https?:\/\//i.test(
                                            item.submission_url ??
                                            '',
                                          )
                                            ? item.submission_url
                                            : null

                                        const Tag =
                                          !release &&
                                          safeUrl
                                            ? 'a'
                                            : 'span'

                                        return (
                                          <Tag
                                            key={
                                              field
                                            }
                                            className={
                                              'timeline-marker ' +
                                              'timeline-card-marker ' +
                                              (
                                                release
                                                  ? 'timeline-release'
                                                  : 'timeline-due'
                                              )
                                            }
                                            style={{
                                              left:
                                                x -
                                                geometry
                                                  .card
                                                  .left,
                                            }}
                                            title={
                                              (
                                                release
                                                  ? 'Release: '
                                                  : 'Due: '
                                              ) +
                                              item[
                                                field
                                              ]
                                            }
                                            role={
                                              Tag ===
                                              'span'
                                                ? 'img'
                                                : undefined
                                            }
                                            {...(
                                              Tag ===
                                              'a'
                                                ? {
                                                    href:
                                                      safeUrl,

                                                    target:
                                                      '_blank',

                                                    rel:
                                                      'noopener noreferrer',
                                                  }
                                                : {}
                                            )}
                                          />
                                        )
                                      },
                                    )}
                                </div>
                              )}
                            </div>
                          ),
                        )}
                      </div>
                    ),
                  )}
                </section>
              )
            },
          )}
      </div>
    </div>
  )
}
