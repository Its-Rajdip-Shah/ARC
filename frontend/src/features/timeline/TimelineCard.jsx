import {
  useState,
} from 'react'

import {
  Anchor,
} from 'lucide-react'

import {
  BUCKETS,
  todayKey,
} from './timelineDates'

import DurationGlyph from './DurationGlyph'
import useHoverIntent from './useHoverIntent'

export default function TimelineCard({
  item,
  find,
  actions,
  flat,
  readOnly = false,
  expanded = false,
  onAnchor,
}) {
  const [
    hoverExpanded,
    setHoverExpanded,
  ] = useState(false)

  const hover =
    useHoverIntent({
      delay: 155,

      onEnter:
        () =>
          setHoverExpanded(
            true,
          ),

      onLeave:
        () =>
          setHoverExpanded(
            false,
          ),
    })

  const bucket =
    BUCKETS.find(
      (entry) =>
        entry.key ===
        item.duration_category,
    )

  const path =
    item.hierarchy_path
      ?.filter(
        (entry) =>
          flat ||
          entry.id !==
            item.root.id,
      )
      .map(
        (entry) =>
          entry.title,
      )
      .join(' / ')

  const anchored =
    Boolean(
      item.manual_requested_date,
    )

  const sessionText =
    item.session_count > 1
      ? (
          `Session ${
            item.session_index + 1
          }/${item.session_count}` +
          (
            item.session_hours != null
              ? ` · ${item.session_hours}h`
              : ''
          ) +
          (
            item.session_percentage != null
              ? ` · ${item.session_percentage}%`
              : ''
          )
        )
      : null

  return (
    <article
      tabIndex={-1}
      ref={
        readOnly
          ? undefined
          : (node) =>
              find.registerCard(
                item.id,
                node,
              )
      }
      draggable={
        !readOnly
      }
      onDragStart={(event) => {
        if (
          readOnly
        ) {
          return
        }

        event.dataTransfer
          .effectAllowed =
          'move'

        event.dataTransfer
          .setData(
            'application/x-arc-item',
            String(
              item.id,
            ),
          )

        event.dataTransfer
          .setData(
            'text/plain',
            String(
              item.id,
            ),
          )
      }}
      className={
        'timeline-card ' +
        (
          item.scheduled_date ===
          todayKey()
            ? 'timeline-today '
            : ''
        ) +
        (
          find.matchIds.has(
            item.id,
          )
            ? 'timeline-search-match '
            : ''
        ) +
        (
          find.currentId ===
          item.id
            ? 'timeline-current-match '
            : ''
        ) +
        (
          anchored
            ? 'timeline-card-anchored '
            : ''
        ) +
        (
          expanded ||
          hoverExpanded
            ? 'timeline-card-expanded '
            : ''
        ) +
        (
          item.timeline_reopen_pending
            ? 'timeline-card-reopen-pending '
            : ''
        )
      }
      onMouseEnter={() =>
        hover.enter()
      }
      onMouseLeave={() =>
        hover.leave()
      }
      onFocus={() =>
        setHoverExpanded(
          true,
        )
      }
      onBlur={() =>
        setHoverExpanded(
          false,
        )
      }
      aria-label={
        item.title +
        ', ' +
        (
          item.scheduled_date
            ? (
                'scheduled ' +
                item.scheduled_date
              )
            : 'not scheduled'
        )
      }
    >
      {!readOnly && (
        <button
          type="button"
          className={
            'timeline-anchor-button ' +
            (
              anchored
                ? 'timeline-anchor-visible'
                : ''
            )
          }
          aria-label={
            anchored
              ? `Edit anchor for ${item.title}`
              : `Anchor ${item.title}`
          }
          title={
            anchored
              ? 'Edit anchor'
              : 'Anchor task'
          }
          onMouseDown={(event) =>
            event.stopPropagation()
          }
          onClick={(event) => {
            event.stopPropagation()

            onAnchor?.(
              item,
            )
          }}
        >
          <Anchor size={14} />
        </button>
      )}

      <div className="timeline-card-main">
        <input
          type="checkbox"
          checked={
            item.is_completed
          }
          disabled={
            readOnly
          }
          aria-label={
            'Complete ' +
            item.title
          }
          onChange={() =>
            !readOnly &&
            actions
              .run(
                'complete',
                {
                  id:
                    item.id,

                  completed:
                    !item.is_completed,
                },
              )
              .catch(() => {})
          }
        />

        <span className="timeline-card-title">
          {item.title}
        </span>

        <span
          className="timeline-duration"
          title={
            bucket?.label
          }
          aria-label={
            bucket?.label
          }
        >
          <DurationGlyph
            level={
              bucket?.level ??
              0
            }
          />
        </span>
      </div>

      <div className="timeline-card-details">
        {sessionText && (
          <p>
            {sessionText}
          </p>
        )}

        <p>
          {
            path ||
            item.root.title
          }
        </p>

        <p>
          {
            item.priority_position !=
            null
              ? (
                  '#' +
                  item.priority_position +
                  ' · '
                )
              : ''
          }

          {
            item.item_type ===
            'ASSIGNMENT'
              ? 'Assignment'
              : 'Task'
          }

          {' · '}

          {bucket?.label}
        </p>

        <p>
          {
            item.manual_requested_date
              ? (
                  'Anchored ' +
                  item.manual_requested_date
                )
              : item.timeline_display_only_date
                ? (
                    'Completed · ' +
                    item.scheduled_date
                  )
                : item.scheduled_date
                  ? (
                      'Scheduled ' +
                      item.scheduled_date
                    )
                  : 'Not scheduled'
          }

          {
            item.overdue
              ? ' · Overdue'
              : ''
          }
        </p>

        {(item.start_date || item.due_date) && (
          <p>
            {
              item.start_date
                ? (
                    'Release ' +
                    item.start_date
                  )
                : ''
            }

            {
              item.start_date &&
              item.due_date
                ? ' · '
                : ''
            }

            {
              item.due_date
                ? (
                    'Due ' +
                    item.due_date
                  )
                : ''
            }
          </p>
        )}

        {item.tags?.length > 0 && (
          <p>
            {
              item.tags
                .map(
                  (tag) =>
                    '#' +
                    tag.name,
                )
                .join(' ')
            }
          </p>
        )}
      </div>
    </article>
  )
}
