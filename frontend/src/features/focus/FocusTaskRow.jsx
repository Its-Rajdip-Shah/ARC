import { useState } from 'react'
import {
  Anchor,
  Check,
  Target,
} from 'lucide-react'

import {
  ancestorLabel,
  duePressureLabel,
  durationLabel,
  scheduledRelativeLabel,
} from './focusModel'
import { plainText } from '../../lib/plainText'


function DetailLine({
  label,
  value,
}) {
  if (
    value === null
    || value === undefined
    || value === ''
  ) {
    return null
  }

  return (
    <div className="focus-detail-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}


export default function FocusTaskRow({
  candidate,
  today,
  pinned,
  onTogglePinned,
  onSetCurrent,
  onComplete,
  onAutomatic,
  currentBusy,
  completionBusy,
  matched = false,
  currentMatch = false,
  registerCard = null,
}) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)

  const ancestors =
    ancestorLabel(
      candidate,
    )

  const scheduled =
    scheduledRelativeLabel(
      candidate,
      today,
    )

  const due =
    duePressureLabel(
      candidate,
      today,
    )

  const anchored =
    Boolean(
      candidate
        .manual_requested_date,
    )

  const descriptionText =
    plainText(
      candidate.description,
    )

  return (
    <article
      ref={(node) =>
        registerCard?.(
          candidate.item_id,
          node,
        )
      }
      data-focus-item-id={
        candidate.item_id
      }
      tabIndex={-1}
      className={[
        'focus-task',
        candidate.is_current
          ? 'is-current'
          : '',
        matched
          ? 'focus-match'
          : '',
        currentMatch
          ? 'focus-current-match'
          : '',
      ].join(' ')}
      onClick={() =>
        onTogglePinned(
          candidate.item_id,
        )
      }
    >
      <div className="focus-task-main">
        <button
          type="button"
          className="focus-complete-box"
          aria-label={`Mark ${candidate.title} complete`}
          disabled={completionBusy}
          onClick={(event) => {
            event.stopPropagation()

            onComplete(
              candidate,
            )
          }}
        >
          <Check
            size={16}
            strokeWidth={2.2}
          />
        </button>

        <button
          type="button"
          className="focus-task-copy"
          onClick={(event) => {
            event.stopPropagation()

            onTogglePinned(
              candidate.item_id,
            )
          }}
        >
          <strong>
            {candidate.title}
          </strong>

          {ancestors && (
            <span className="focus-ancestor">
              {ancestors}
            </span>
          )}

          <span className="focus-task-meta">
            {scheduled && (
              <span className="focus-relative-day">
                {scheduled}
              </span>
            )}

            {due && (
              <span className="focus-due-pressure">
                {due}
              </span>
            )}
          </span>
        </button>

        <div className="focus-row-actions">
          {anchored && (
            <button
              type="button"
              className="focus-anchor-button is-anchored"
              aria-label={`Remove anchor from ${candidate.title}`}
              title="Remove anchor"
              onClick={(event) => {
                event.stopPropagation()

                onAutomatic(
                  candidate,
                )
              }}
            >
              <Anchor size={15} />
            </button>
          )}

          <button
            type="button"
            className={[
              'focus-target-button',
              candidate.is_current
                ? 'is-current'
                : '',
            ].join(' ')}
            aria-label={
              candidate.is_current
                ? `${candidate.title} is current focus`
                : `Set ${candidate.title} as current focus`
            }
            aria-pressed={
              candidate.is_current
            }
            disabled={currentBusy}
            onClick={(event) => {
              event.stopPropagation()

              onSetCurrent(
                candidate,
              )
            }}
          >
            <Target
              size={17}
              strokeWidth={2}
            />
          </button>
        </div>
      </div>

      <div
        className={[
          'focus-task-details',
          pinned
            ? 'is-pinned'
            : '',
        ].join(' ')}
      >
        {descriptionText && (
          <div className="focus-description-block">
            <p className="focus-description">
              {descriptionExpanded || descriptionText.length <= 180
                ? descriptionText
                : `${descriptionText.slice(0, 180).trimEnd()}…`}
            </p>

            {descriptionText.length > 180 && (
              <button
                type="button"
                className="focus-description-toggle"
                aria-expanded={descriptionExpanded}
                onClick={(event) => {
                  event.stopPropagation()
                  setDescriptionExpanded((expanded) => !expanded)
                }}
              >
                {descriptionExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        <div className="focus-detail-grid">
          <DetailLine
            label="Release"
            value={candidate.start_date}
          />

          <DetailLine
            label="Due"
            value={candidate.due_date}
          />

          <DetailLine
            label="Duration"
            value={
              durationLabel(
                candidate.duration_category,
              )
            }
          />

          <DetailLine
            label="Priority"
            value={
              candidate.priority_position
            }
          />

          <DetailLine
            label="Progress"
            value={`${candidate.percent_completed ?? 0}%`}
          />
        </div>
      </div>
    </article>
  )
}
