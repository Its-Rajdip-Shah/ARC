import { userDateKey } from '../../lib/calendarDates.js'

// Date-only arithmetic uses UTC internally.
export const DAY = 86400000
export const COLUMN_WIDTH = 112

export const parseDate = (value) =>
  new Date(value + 'T00:00:00Z')

export const dateKey = (date) =>
  date.toISOString().slice(0, 10)

export function todayKey() {
  return userDateKey()
}

export const addDays = (key, days) =>
  dateKey(
    new Date(
      +parseDate(key) +
      days * DAY,
    ),
  )

export const formatDate = (key, options) =>
  parseDate(key).toLocaleDateString(
    undefined,
    {
      ...options,
      timeZone: 'UTC',
    },
  )

function monday(key) {
  return addDays(
    key,
    -(
      (
        parseDate(key).getUTCDay() +
        6
      ) % 7
    ),
  )
}

export function shiftDate(
  key,
  zoom,
  amount,
) {
  if (zoom !== 'month') {
    return addDays(
      key,
      amount * (
        zoom === 'week'
          ? 7
          : 1
      ),
    )
  }

  const date = parseDate(key)
  const day = date.getUTCDate()

  date.setUTCDate(1)

  date.setUTCMonth(
    date.getUTCMonth() + amount,
  )

  const last = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate()

  date.setUTCDate(
    Math.min(
      day,
      last,
    ),
  )

  return dateKey(date)
}

function weekNumber(key) {
  const thursday =
    parseDate(
      addDays(
        monday(key),
        3,
      ),
    )

  return Math.ceil(
    (
      (
        thursday -
        Date.UTC(
          thursday.getUTCFullYear(),
          0,
          1,
        )
      ) / DAY +
      1
    ) / 7,
  )
}

function clamp(
  value,
  min,
  max,
) {
  return Math.max(
    min,
    Math.min(
      max,
      value,
    ),
  )
}

function responsiveLayout(
  zoom,
  viewportWidth,
) {
  const config = {
    day: {
      target: 118,
      min: 88,
      max: 150,
      minCount: 7,
      maxCount: 16,
    },

    week: {
      target: 190,
      min: 140,
      max: 260,
      minCount: 3,
      maxCount: 8,
    },

    month: {
      target: 250,
      min: 180,
      max: 340,
      minCount: 3,
      maxCount: 6,
    },
  }[zoom]

  const width = Math.max(
    480,
    Math.floor(
      viewportWidth,
    ),
  )

  const minimumCountFromMaxWidth =
    Math.ceil(
      width /
      config.max,
    )

  const maximumCountFromMinWidth =
    Math.max(
      1,
      Math.floor(
        width /
        config.min,
      ),
    )

  const lower = Math.max(
    config.minCount,
    minimumCountFromMaxWidth,
  )

  const upper = Math.max(
    lower,
    Math.min(
      config.maxCount,
      maximumCountFromMinWidth,
    ),
  )

  const count = clamp(
    Math.round(
      width /
      config.target,
    ),
    lower,
    upper,
  )

  return {
    count,
    columnWidth:
      width / count,
    width,
  }
}

export function makeScale(
  anchor,
  zoom,
  viewportWidth = null,
) {
  const start =
    zoom === 'month'
      ? anchor.slice(0, 7) + '-01'
      : zoom === 'week'
        ? monday(anchor)
        : anchor

  // Tests and non-responsive consumers retain the old deterministic scale.
  const fallback =
    zoom === 'day'
      ? {
          count: 14,
          columnWidth: 112,
          width: 1568,
        }
      : zoom === 'week'
        ? {
            count: 8,
            columnWidth: 168,
            width: 1344,
          }
        : {
            count: 12,
            columnWidth: 280,
            width: 3360,
          }

  const layout =
    viewportWidth == null
      ? fallback
      : responsiveLayout(
          zoom,
          viewportWidth,
        )

  const columns =
    Array.from(
      {
        length:
          layout.count,
      },
      (_, index) => {
        const from =
          shiftDate(
            start,
            zoom,
            index,
          )

        const next =
          shiftDate(
            start,
            zoom,
            index + 1,
          )

        const to =
          addDays(
            next,
            -1,
          )

        return {
          from,
          to,

          title:
            zoom === 'day'
              ? formatDate(
                  from,
                  {
                    weekday:
                      'short',
                  },
                )
              : zoom ===
                    'week'
                ? (
                    'W' +
                    weekNumber(
                      from,
                    )
                  )
                : formatDate(
                    from,
                    {
                      month:
                        'short',
                    },
                  ),

          subtitle:
            zoom === 'day'
              ? formatDate(
                  from,
                  {
                    day:
                      'numeric',
                  },
                )
              : zoom ===
                    'week'
                ? (
                    formatDate(
                      from,
                      {
                        day:
                          'numeric',
                        month:
                          'short',
                      },
                    ) +
                    '–' +
                    formatDate(
                      to,
                      {
                        day:
                          'numeric',
                        month:
                          'short',
                      },
                    )
                  )
                : from.slice(
                    0,
                    4,
                  ),
        }
      },
    )

  return {
    from: start,
    to: columns.at(-1).to,
    columns,
    columnWidth:
      layout.columnWidth,
    width:
      layout.width,
  }
}

export function positionOf(
  key,
  scale,
  edge = 'start',
) {
  const index =
    scale.columns.findIndex(
      (column) =>
        key >= column.from &&
        key <= column.to,
    )

  if (index === -1) {
    return key < scale.from
      ? 0
      : scale.width
  }

  const column =
    scale.columns[index]

  const duration =
    parseDate(
      addDays(
        column.to,
        1,
      ),
    ) -
    parseDate(
      column.from,
    )

  const boundary =
    edge === 'end'
      ? addDays(
          key,
          1,
        )
      : key

  const fraction =
    (
      parseDate(
        boundary,
      ) -
      parseDate(
        column.from,
      )
    ) /
    duration

  return (
    index +
    fraction
  ) *
  scale.columnWidth
}

/*
 * Point events such as releases/deadlines belong to a DATE, not the
 * boundary between two date columns.  Put the dot in the centre of that
 * day's actual portion of the current day/week/month column.
 */
export function datePointPosition(
  key,
  scale,
) {
  if (!key) {
    return null
  }

  const start =
    positionOf(
      key,
      scale,
    )

  const end =
    positionOf(
      key,
      scale,
      'end',
    )

  return (
    start +
    end
  ) / 2
}

export function dateAtPosition(
  x,
  scale,
) {
  const clamped =
    clamp(
      x,
      0,
      Math.max(
        0,
        scale.width -
          0.0001,
      ),
    )

  const index =
    clamp(
      Math.floor(
        clamped /
        scale.columnWidth,
      ),
      0,
      scale.columns.length -
        1,
    )

  const column =
    scale.columns[index]

  const fraction =
    (
      clamped -
      index *
        scale.columnWidth
    ) /
    scale.columnWidth

  const days =
    Math.max(
      1,
      Math.round(
        (
          parseDate(
            addDays(
              column.to,
              1,
            ),
          ) -
          parseDate(
            column.from,
          )
        ) / DAY,
      ),
    )

  return addDays(
    column.from,
    Math.min(
      days - 1,
      Math.floor(
        fraction *
        days,
      ),
    ),
  )
}

export function intervalGeometry(
  start,
  end,
  scale,
  endEdge = 'start',
) {
  if (
    !start ||
    !end ||
    start > end ||
    start > scale.to ||
    end < scale.from
  ) {
    return null
  }

  const left =
    positionOf(
      start,
      scale,
    )

  return {
    left,

    width:
      positionOf(
        end,
        scale,
        endEdge,
      ) -
      left,
  }
}

export const inRange = (
  key,
  scale,
) =>
  Boolean(
    key &&
    key >= scale.from &&
    key <= scale.to,
  )

export const BUCKETS = [
  {
    key:
      'UNDER_20_MINUTES',
    label:
      'Under 20 minutes',
    shortLabel:
      '<20m',
    level: 1,
  },
  {
    key:
      'UNDER_1_HOUR',
    label:
      'Under 1 hour',
    shortLabel:
      '<1h',
    level: 2,
  },
  {
    key:
      'UNDER_4_HOURS',
    label:
      'Under 4 hours',
    shortLabel:
      '<4h',
    level: 3,
  },
  {
    key:
      'UNDER_8_HOURS',
    label:
      'Under 8 hours',
    shortLabel:
      '<8h',
    level: 4,
  },
  {
    key:
      'UNDER_16_HOURS',
    label:
      'Under 16 hours',
    shortLabel:
      '<16h',
    level: 5,
  },
  {
    key:
      'OVER_16_HOURS',
    label:
      'Over 16 hours',
    shortLabel:
      '>16h',
    level: 6,
  },
]

export function packLanes(
  timezones,
  scale,
) {
  const visible =
    timezones
      .filter(
        (zone) =>
          intervalGeometry(
            zone.start_date,
            zone.end_date,
            scale,
            'end',
          ),
      )
      .map(
        (zone) => ({
          ...zone,
        }),
      )
      .sort(
        (a, b) =>
          a.start_date.localeCompare(
            b.start_date,
          ) ||
          a.end_date.localeCompare(
            b.end_date,
          ),
      )

  const lanes = []
  const assignments = []

  for (const zone of visible) {
    let placed = -1

    for (
      let i = 0;
      i < lanes.length;
      i += 1
    ) {
      if (
        lanes[i] <
        zone.start_date
      ) {
        placed = i
        break
      }
    }

    if (placed === -1) {
      placed = lanes.length
      lanes.push('')
    }

    lanes[placed] =
      zone.end_date

    assignments.push({
      zone,
      lane: placed,
    })
  }

  return {
    assignments,
    laneCount:
      lanes.length,
  }
}

export function colourZones(
  assignments,
  scale,
) {
  const coloured = []

  return assignments.map(
    (assignment) => {
      const interval =
        intervalGeometry(
          assignment.zone
            .start_date,
          assignment.zone
            .end_date,
          scale,
          'end',
        )

      const neighbours =
        coloured.filter(
          (other) =>
            Math.abs(
              other.lane -
              assignment.lane,
            ) <= 1 &&
            interval.left <=
              other.interval.left +
                other.interval.width +
                1e-9 &&
            other.interval.left <=
              interval.left +
                interval.width +
                1e-9,
        )

      const used =
        new Set(
          neighbours.map(
            (other) =>
              other.colour,
          ),
        )

      let colour = 0

      while (
        used.has(
          colour,
        )
      ) {
        colour += 1
      }

      if (
        colour >= 3
      ) {
        const counts =
          [0, 1, 2].map(
            (value) =>
              neighbours.filter(
                (other) =>
                  other.colour ===
                  value,
              ).length,
          )

        colour =
          counts.indexOf(
            Math.min(
              ...counts,
            ),
          )
      }

      const result = {
        ...assignment,
        interval,
        colour,
      }

      coloured.push(
        result,
      )

      return result
    },
  )
}

export const TASK_CARD_COLLISION_WIDTH =
  285

export const TASK_COLLISION_GAP =
  12

export const TASK_MARKER_RADIUS =
  8

export function taskGeometry(
  item,
  scale,
  options = {},
) {
  const centerDates =
    Boolean(
      options.centerDates,
    )

  const clampCards =
    Boolean(
      options.clampCards,
    )

  const point = (key) =>
    centerDates
      ? datePointPosition(
          key,
          scale,
        )
      : positionOf(
          key,
          scale,
        )

  let card = null

  if (
    inRange(
      item.scheduled_date,
      scale,
    )
  ) {
    let left =
      point(
        item.scheduled_date,
      )

    if (
      centerDates
    ) {
      left -=
        TASK_CARD_COLLISION_WIDTH /
        2
    }

    if (
      clampCards
    ) {
      left =
        clamp(
          left,
          0,
          Math.max(
            0,
            scale.width -
              TASK_CARD_COLLISION_WIDTH,
          ),
        )
    }

    card = {
      left,
      width:
        TASK_CARD_COLLISION_WIDTH,
    }
  }

  /*
   * A canonical task may materialise as multiple visual scheduler-session
   * cards. Release/deadline constraints belong to the canonical task, not to
   * every session clone.
   *
   * TimelinePage marks only the first visual session show_constraints=true.
   * Later sessions therefore contribute ONLY their execution card and must
   * not manufacture duplicate endpoint dots, constraint lines, or collision
   * footprint.
   */
  const showConstraints =
    item.show_constraints !== false

  const start =
    showConstraints
      ? (
          item.start_date ||
          (
            item.due_date
              ? item.scheduled_date
              : null
          )
        )
      : null

  const end =
    showConstraints
      ? (
          item.due_date ||
          (
            item.start_date
              ? item.scheduled_date
              : null
          )
        )
      : null

  let constraint = null

  if (
    showConstraints &&
    start &&
    end &&
    !(
      start > scale.to ||
      end < scale.from
    )
  ) {
    if (
      centerDates
    ) {
      const left =
        point(
          start < end
            ? start
            : end,
        )

      const right =
        point(
          start < end
            ? end
            : start,
        )

      const clippedLeft =
        Math.max(
          0,
          left,
        )

      const clippedRight =
        Math.min(
          scale.width,
          right,
        )

      constraint = {
        left:
          clippedLeft,

        width:
          Math.max(
            0,
            clippedRight -
              clippedLeft,
          ),
      }
    } else {
      constraint =
        intervalGeometry(
          start < end
            ? start
            : end,
          start < end
            ? end
            : start,
          scale,
        )
    }
  }

  /*
   * Endpoint dots are meaningful only when they are visually connected to
   * something: either this task's visible execution card or a visible
   * constraint line.
   *
   * A due-only/release-only item with no scheduled execution previously
   * produced an orphan floating dot. Do not manufacture that marker.
   */
  const markerHasContext =
    Boolean(
      card ||
      constraint,
    )

  const markers =
    showConstraints &&
    markerHasContext
      ? [
          'start_date',
          'due_date',
        ]
          .filter(
            (field) =>
              inRange(
                item[field],
                scale,
              ),
          )
          .map(
        (field) => {
          const x =
            point(
              item[field],
            )

          return {
            field,
            x,

            popped:
              Boolean(
                card &&
                x >=
                  card.left -
                    TASK_MARKER_RADIUS &&
                x <=
                  card.left +
                    card.width +
                    TASK_MARKER_RADIUS,
              ),
          }
        },
      )
      : []

  const extents = [
    ...(
      card
        ? [[
            card.left,
            card.left +
              card.width,
          ]]
        : []
    ),

    ...(
      constraint
        ? [[
            constraint.left,
            constraint.left +
              constraint.width,
          ]]
        : []
    ),

    ...markers.map(
      ({ x }) => [
        x -
          TASK_MARKER_RADIUS,
        x +
          TASK_MARKER_RADIUS,
      ],
    ),
  ]

  if (
    !extents.length
  ) {
    return null
  }

  return {
    card,
    constraint,
    markers,

    left:
      Math.max(
        0,
        Math.min(
          ...extents.map(
            ([left]) =>
              left,
          ),
        ) -
          TASK_COLLISION_GAP /
            2,
      ),

    right:
      Math.min(
        scale.width,
        Math.max(
          ...extents.map(
            ([, right]) =>
              right,
          ),
        ) +
          TASK_COLLISION_GAP /
            2,
      ),
  }
}

export function packTaskLanes(
  items,
  scale,
  options = {},
) {
  const entries =
    items
      .map(
        (item) => ({
          item,

          geometry:
            taskGeometry(
              item,
              scale,
              options,
            ),
        }),
      )
      .filter(
        ({ geometry }) =>
          geometry,
      )
      .sort(
        (a, b) =>
          a.geometry.left -
            b.geometry.left ||
          a.geometry.right -
            b.geometry.right ||
          String(
            a.item.render_id ??
            a.item.id,
          ).localeCompare(
            String(
              b.item.render_id ??
              b.item.id,
            ),
          ),
      )

  const lanes = []
  const ends = []

  for (
    const entry
    of entries
  ) {
    let lane =
      ends.findIndex(
        (end) =>
          end <
          entry.geometry.left,
      )

    if (
      lane === -1
    ) {
      lane =
        lanes.length

      lanes.push([])
    }

    lanes[lane].push(
      entry,
    )

    ends[lane] =
      entry.geometry.right
  }

  return lanes
}

export function itemsInPeriod(
  items,
  column,
) {
  if (!column) {
    return items
  }

  return items.filter(
    (item) =>
      item.scheduled_date &&
      item.scheduled_date >=
        column.from &&
      item.scheduled_date <=
        column.to,
  )
}

export function concentratedItems(
  items,
  hoveredColumn,
  selectedColumn,
) {
  const activeColumn =
    hoveredColumn ??
    selectedColumn

  return activeColumn
    ? itemsInPeriod(
        items,
        activeColumn,
      )
    : items
}

export function isPersistentConcentration(
  hoveredColumn,
  selectedColumn,
) {
  return (
    selectedColumn !== null &&
    hoveredColumn === null
  )
}
