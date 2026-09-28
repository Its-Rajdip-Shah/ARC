import { useState } from 'react'

import { BUCKETS } from './timelineDates'

const allDurations =
  BUCKETS.map(
    (bucket) =>
      bucket.key,
  )

const defaults = {
  zoom: 'day',
  type: 'all',
  durations: allDurations,
  grouped: true,
  completed: false,
  roots: [],
}

function normaliseDurations(value) {
  if (
    Array.isArray(value)
  ) {
    const cleaned =
      [
        ...new Set(
          value.filter(
            (entry) =>
              allDurations.includes(
                entry,
              ),
          ),
        ),
      ]

    return cleaned.length
      ? cleaned
      : [...allDurations]
  }

  if (
    value === 'all' ||
    value == null
  ) {
    return [...allDurations]
  }

  // Migrate the F1 3-group preference automatically.
  const legacy = {
    short: [
      'UNDER_20_MINUTES',
      'UNDER_1_HOUR',
    ],

    medium: [
      'UNDER_4_HOURS',
      'UNDER_8_HOURS',
    ],

    long: [
      'UNDER_16_HOURS',
      'OVER_16_HOURS',
    ],
  }

  return legacy[value]
    ? [...legacy[value]]
    : [...allDurations]
}

export function readTimelinePreferences(
  userId,
) {
  if (
    userId == null
  ) {
    return {
      ...defaults,
      durations:
        [...allDurations],
    }
  }

  try {
    const value =
      JSON.parse(
        localStorage.getItem(
          'arc.timeline.v1.' +
          userId,
        ),
      ) ?? {}

    return {
      zoom:
        [
          'day',
          'week',
          'month',
        ].includes(
          value.zoom,
        )
          ? value.zoom
          : defaults.zoom,

      type:
        [
          'all',
          'tasks',
          'assignments',
        ].includes(
          value.type,
        )
          ? value.type
          : defaults.type,

      durations:
        normaliseDurations(
          value.durations ??
          value.duration,
        ),

      grouped:
        typeof value.grouped ===
        'boolean'
          ? value.grouped
          : defaults.grouped,

      completed:
        typeof value.completed ===
        'boolean'
          ? value.completed
          : defaults.completed,

      roots:
        Array.isArray(
          value.roots,
        )
          ? [
              ...new Set(
                value.roots.filter(
                  Number.isSafeInteger,
                ),
              ),
            ]
          : [],
    }

  } catch {
    return {
      ...defaults,
      durations:
        [...allDurations],
    }
  }
}

export default function useTimelinePreferences(
  userId,
) {
  const [
    preferences,
    setPreferences,
  ] = useState(
    () =>
      readTimelinePreferences(
        userId,
      ),
  )

  function update(patch) {
    const next = {
      ...preferences,
      ...patch,
    }

    setPreferences(next)

    if (
      userId != null
    ) {
      try {
        localStorage.setItem(
          'arc.timeline.v1.' +
          userId,
          JSON.stringify(
            next,
          ),
        )
      } catch {
        // Keep the in-memory preference.
      }
    }
  }

  return [
    preferences,
    update,
  ]
}
