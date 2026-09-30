const EMPTY_CANDIDATES = []

export const FOCUS_VISIBLE_LIMIT = 3
export const RELATIVE_DATE_HORIZON = 14

const DURATION_LABELS = {
  UNDER_20_MINUTES: '<20m',
  UNDER_1_HOUR: '<1h',
  UNDER_4_HOURS: '<4h',
  UNDER_8_HOURS: '<8h',
  UNDER_16_HOURS: '<16h',
  OVER_16_HOURS: '>16h',
}

export const FOCUS_BUCKETS = [
  {
    id: 'boss',
    label: 'BOSS FIGHTS',
    categories: [
      'UNDER_4_HOURS',
      'UNDER_8_HOURS',
      'UNDER_16_HOURS',
      'OVER_16_HOURS',
    ],
  },
  {
    id: 'side',
    label: 'SIDE QUESTS',
    categories: [
      'UNDER_1_HOUR',
    ],
  },
  {
    id: 'quick',
    label: 'QUICK WINS',
    categories: [
      'UNDER_20_MINUTES',
    ],
  },
]

function localDate(value) {
  return value
    ? new Date(
        `${value}T00:00:00`,
      )
    : null
}

export function dayDifference(
  value,
  today,
) {
  if (!value || !today) {
    return null
  }

  return Math.round(
    (
      localDate(value).getTime()
      - localDate(today).getTime()
    )
    / 86_400_000,
  )
}

export function durationLabel(category) {
  return (
    DURATION_LABELS[
      category
    ]
    ?? category
    ?? ''
  )
}

export function bucketForCategory(
  category,
) {
  return (
    FOCUS_BUCKETS.find(
      (bucket) =>
        bucket.categories.includes(
          category,
        ),
    )
    ?? null
  )
}

export function candidatesForBucket(
  candidates,
  bucket,
) {
  return (
    candidates
    ?? EMPTY_CANDIDATES
  ).filter(
    (candidate) =>
      bucket.categories.includes(
        candidate.duration_category,
      ),
  )
}

export function visibleCandidatesForBucket(
  candidates,
  bucket,
) {
  const queue =
    candidatesForBucket(
      candidates,
      bucket,
    )

  const current =
    queue.find(
      (candidate) =>
        candidate.is_current,
    )

  const first =
    queue.slice(
      0,
      FOCUS_VISIBLE_LIMIT,
    )

  if (
    !current
    || first.some(
      (candidate) =>
        candidate.item_id
        === current.item_id,
    )
  ) {
    return first
  }

  return [
    current,
    ...queue.filter(
      (candidate) =>
        candidate.item_id
        !== current.item_id,
    ),
  ].slice(
    0,
    FOCUS_VISIBLE_LIMIT,
  )
}

export function ancestorLabel(candidate) {
  const path =
    candidate
      ?.hierarchy_path
    ?? []

  return path
    .slice(0, -1)
    .join(' | ')
}

export function absoluteDateLabel(value) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat(
    'en-AU',
    {
      day: '2-digit',
      month: 'short',
    },
  ).format(
    localDate(value),
  )
}

export function scheduledRelativeLabel(
  candidate,
  today,
) {
  const value =
    candidate
      ?.scheduled_date

  const difference =
    dayDifference(
      value,
      today,
    )

  if (difference === null) {
    return ''
  }

  if (difference <= 0) {
    return 'Today'
  }

  if (difference === 1) {
    return 'Tomorrow'
  }

  if (
    difference
    <= RELATIVE_DATE_HORIZON
  ) {
    return `In ${difference} days`
  }

  return absoluteDateLabel(
    value,
  )
}

export function duePressureLabel(
  candidate,
  today,
) {
  const difference =
    dayDifference(
      candidate
        ?.due_date,
      today,
    )

  if (difference === null) {
    return ''
  }

  if (difference < 0) {
    return `${Math.abs(difference)}d overdue`
  }

  if (difference === 0) {
    return 'Due today'
  }

  if (difference === 1) {
    return 'Due tomorrow'
  }

  return `Due in ${difference}d`
}

export function dateGroupLabel(
  value,
  today,
) {
  const difference =
    dayDifference(
      value,
      today,
    )

  if (difference === 0) {
    return 'TODAY'
  }

  if (difference === 1) {
    return 'TOMORROW'
  }

  if (!value) {
    return 'UNSCHEDULED'
  }

  const date =
    localDate(value)

  const datePart =
    new Intl.DateTimeFormat(
      'en-AU',
      {
        day: '2-digit',
        month: 'short',
      },
    )
      .format(date)
      .toUpperCase()

  const weekday =
    new Intl.DateTimeFormat(
      'en-AU',
      {
        weekday: 'short',
      },
    )
      .format(date)
      .toUpperCase()

  return `${datePart} · ${weekday}`
}

export function hierarchyPaths(
  candidates,
) {
  return new Map(
    (
      candidates
      ?? []
    ).map(
      (candidate) => [
        candidate.item_id,
        (
          candidate
            .hierarchy_path
          ?? []
        )
          .slice(
            0,
            -1,
          )
          .map(
            (
              title,
              index,
            ) => ({
              id:
                `${candidate.item_id}-${index}`,
              title,
            }),
          ),
      ],
    ),
  )
}
