import ArcDateField from '../../components/ArcDateField'
import {
  useState,
} from 'react'

import {
  Anchor,
  X,
} from 'lucide-react'

import {
  todayKey,
} from './timelineDates'

import {
  conflictCopy,
} from './timelineConflictPolicy'

export default function AnchorDialog({
  request,
  actions,
  onClose,
}) {
  const item =
    request?.item

  const [
    date,
    setDate,
  ] = useState(
    () =>
      request?.date ??
      item?.manual_requested_date ??
      todayKey(),
  )

  const [
    decisionResponse,
    setDecisionResponse,
  ] = useState(null)

  const [
    localError,
    setLocalError,
  ] = useState('')

  const conflicts =
    decisionResponse
      ?.conflicts ??
    []

  const decisions =
    decisionResponse
      ?.decisions ??
    []

  const decisionCodes =
    new Set(
      decisions.map(
        (row) =>
          row.code,
      ),
    )

  if (!item) {
    return null
  }

  async function submit(
    extra = {},
  ) {
    setLocalError('')

    try {
      await actions.run(
        'anchor',
        {
          item_id: item.id,
          date,
          ...extra,
        },
      )

      onClose()

    } catch (error) {
      const data =
        error?.response?.data

      if (
        error?.response?.status ===
          409 &&
        data?.conflicts
      ) {
        setDecisionResponse(
          data,
        )

        return
      }

      setLocalError(
        data?.detail
          ? String(
              data.detail,
            )
          : (
              'ARC could not ' +
              'apply this anchor.'
            ),
      )
    }
  }

  async function remove() {
    setLocalError('')

    try {
      await actions.run(
        'anchor',
        {
          item_id:
            item.id,

          remove:
            true,
        },
      )

      onClose()

    } catch (error) {
      setLocalError(
        error?.response
          ?.data
          ?.detail ??
        (
          'ARC could not ' +
          'remove this anchor.'
        ),
      )
    }
  }

  function resolveAndSubmit() {
    submit({
      change_deadline:
        decisionCodes.has(
          'change_deadline',
        ),

      change_release:
        decisionCodes.has(
          'change_release',
        ),

      allow_overload:
        decisionCodes.has(
          'allow_overload',
        ),

      acknowledge_dependency_block:
        decisionCodes.has(
          'acknowledge_dependency_block',
        ),
    })
  }

  return (
    <div
      className="timeline-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose()
        }
      }}
    >
      <section
        className="timeline-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={
          `Anchor ${item.title}`
        }
      >
        <button
          type="button"
          className="timeline-dialog-close"
          aria-label="Close anchor editor"
          onClick={onClose}
        >
          <X size={17} />
        </button>

        <div className="timeline-dialog-title">
          <Anchor size={18} />

          <div>
            <strong>
              {
                item.manual_requested_date
                  ? 'Edit anchor'
                  : 'Anchor task'
              }
            </strong>

            <p>
              {item.title}
            </p>
          </div>
        </div>

        <div className="timeline-date-field">
          Anchor date

          <ArcDateField
            aria-label="Anchor date"
            type="date"
            value={date}
            onChange={(event) => {
              setDate(
                event.target.value,
              )

              setDecisionResponse(
                null,
              )
            }}
          />
        </div>

        {conflicts.length > 0 && (
          <div
            className="timeline-decision-box"
            role="alert"
          >
            {conflicts.map(
              (conflict) => {
                const copy =
                  conflictCopy(
                    conflict.code,
                  )

                return (
                  <div
                    key={
                      conflict.code
                    }
                  >
                    <strong>
                      {copy.title}
                    </strong>

                    <p>
                      {copy.detail}
                    </p>

                    {conflict.original_date && conflict.proposed_date && (
                      <p>
                        Canonical date: {conflict.original_date} → proposed {conflict.proposed_date}
                      </p>
                    )}
                  </div>
                )
              },
            )}

            <div className="timeline-dialog-actions">
              {decisions.length > 0 && (
                <button
                  type="button"
                  className="timeline-primary-button"
                  onClick={
                    resolveAndSubmit
                  }
                  disabled={
                    actions.busy
                  }
                >
                  Apply explicit decision and anchor
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setDecisionResponse(
                    null,
                  )
                }}
              >
                Choose another date
              </button>

              <button
                type="button"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {localError && (
          <p
            className="timeline-error"
            role="alert"
          >
            {localError}
          </p>
        )}

        {!conflicts.length && (
          <div className="timeline-dialog-actions">
            <button
              type="button"
              className="timeline-primary-button"
              disabled={
                !date ||
                actions.busy
              }
              onClick={() =>
                submit()
              }
            >
              {
                item.manual_requested_date
                  ? 'Save anchor'
                  : 'Anchor to this date'
              }
            </button>

            {item.manual_requested_date && (
              <button
                type="button"
                className="timeline-danger-button"
                disabled={
                  actions.busy
                }
                onClick={
                  remove
                }
              >
                Remove anchor
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
