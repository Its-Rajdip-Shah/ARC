import {
  AlertTriangle,
  ArrowDown,
  CalendarClock,
  GitBranch,
  Gauge,
  X,
} from 'lucide-react'


const COPY = {
  blocked_dependency: {
    title:
      'Dependency',

    detail:
      'This move conflicts with a hard prerequisite. ARC will only remove that relationship if you explicitly choose to dissolve it.',

    icon:
      GitBranch,
  },

  after_deadline: {
    title:
      'Deadline',

    detail:
      'This placement falls after the task’s current deadline.',

    icon:
      CalendarClock,
  },

  before_release: {
    title:
      'Release date',

    detail:
      'This placement falls before the task is currently available.',

    icon:
      CalendarClock,
  },

  capacity_exceeded: {
    title:
      'Day capacity',

    detail:
      'This explicit placement exceeds ARC’s configured capacity for this duration class on that day.',

    icon:
      Gauge,
  },

  anchor_order_taken: {
    title:
      'Queue position',

    detail:
      'Another explicit Focus anchor already owns this local queue position.',

    icon:
      AlertTriangle,
  },

  past_date: {
    title:
      'Past date',

    detail:
      'ARC cannot schedule unfinished work into the past.',

    icon:
      CalendarClock,
  },
}


function humanDate(
  value,
) {
  if (!value) {
    return '—'
  }

  const date =
    new Date(
      `${value}T00:00:00Z`,
    )

  return new Intl.DateTimeFormat(
    undefined,
    {
      timeZone: 'UTC',

      day:
        'numeric',

      month:
        'short',
    },
  ).format(
    date,
  )
}


function Facts({
  conflict,
}) {
  if (
    conflict.code
    === 'after_deadline'
  ) {
    return (
      <div className="focus-conflict-facts">
        <div>
          <span>
            Current deadline
          </span>

          <strong>
            {humanDate(
              conflict.current_date,
            )}
          </strong>
        </div>

        <div>
          <span>
            Requested placement
          </span>

          <strong>
            {humanDate(
              conflict.requested_date,
            )}
          </strong>
        </div>
      </div>
    )
  }

  if (
    conflict.code
    === 'before_release'
  ) {
    return (
      <div className="focus-conflict-facts">
        <div>
          <span>
            Current release
          </span>

          <strong>
            {humanDate(
              conflict.current_date,
            )}
          </strong>
        </div>

        <div>
          <span>
            Requested placement
          </span>

          <strong>
            {humanDate(
              conflict.requested_date,
            )}
          </strong>
        </div>
      </div>
    )
  }

  if (
    conflict.code
    === 'capacity_exceeded'
    && conflict.capacity_limit
    != null
  ) {
    return (
      <div className="focus-conflict-capacity">
        <strong>
          {humanDate(
            conflict.requested_date,
          )}
        </strong>

        <span>
          {conflict.resulting_count}
          {' '}
          {
            conflict.duration_label
            ?? 'tasks'
          }
          {' · limit '}
          {conflict.capacity_limit}
        </span>

        <p>
          This move would put the day
          {' '}
          {conflict.over_by_count}
          {' '}
          task
          {
            conflict.over_by_count
            === 1
              ? ''
              : 's'
          }
          {' '}
          over this capacity class.
        </p>
      </div>
    )
  }

  return null
}


function DependencyGraph({
  conflict,
}) {
  const prerequisites =
    conflict.prerequisites
    ?? []

  if (
    conflict.code
    !== 'blocked_dependency'
    || prerequisites.length === 0
  ) {
    return null
  }

  return (
    <div className="focus-conflict-graph">
      {prerequisites.map(
        (prerequisite) => (
          <div
            key={
              prerequisite.item_id
            }
            className="focus-conflict-chain"
          >
            <div className="focus-conflict-node">
              {prerequisite.title}
            </div>

            <ArrowDown
              size={19}
              aria-hidden="true"
            />

            <div className="focus-conflict-node is-target">
              {conflict.item_title}
            </div>
          </div>
        ),
      )}
    </div>
  )
}


export default function FocusConflictDialog({
  conflict,
  onCancel,
  onResolve,
}) {
  if (!conflict) {
    return null
  }

  const conflicts =
    conflict.data
      ?.conflicts
    ?? []

  const decisions =
    conflict.data
      ?.decisions
    ?? []

  const primary =
    conflicts[0]
    ?? {
      code:
        'unknown',
    }

  const copy =
    COPY[
      primary.code
    ]
    ?? {
      title:
        'Scheduling conflict',

      detail:
        'ARC cannot apply this placement without an explicit decision.',

      icon:
        AlertTriangle,
    }

  const Icon =
    copy.icon

  return (
    <div
      className="focus-conflict-backdrop"
      role="presentation"
    >
      <section
        className="focus-conflict-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
      >
        <div className="focus-conflict-glow" />

        <button
          type="button"
          className="focus-conflict-close"
          aria-label="Cancel"
          onClick={onCancel}
        >
          <X size={19} />
        </button>

        <div className="focus-conflict-heading">
          <div className="focus-conflict-icon">
            <Icon size={22} />
          </div>

          <div>
            <span>
              ARC CONSTRAINT
            </span>

            <h2>
              {copy.title}
            </h2>
          </div>
        </div>

        {primary.item_title && (
          <div className="focus-conflict-task-name">
            {primary.item_title}
          </div>
        )}

        <p className="focus-conflict-explanation">
          {copy.detail}
        </p>

        <Facts
          conflict={primary}
        />

        <DependencyGraph
          conflict={primary}
        />

        {conflicts.length > 1 && (
          <div className="focus-conflict-more">
            {conflicts.slice(1).map(
              (
                entry,
                index,
              ) => (
                <div
                  key={`${entry.code}-${entry.item_id ?? index}`}
                >
                  <strong>
                    {
                      COPY[
                        entry.code
                      ]?.title
                      ?? entry.code
                    }
                  </strong>

                  <span>
                    {
                      COPY[
                        entry.code
                      ]?.detail
                    }
                  </span>
                </div>
              ),
            )}
          </div>
        )}

        <div className="focus-conflict-decision-label">
          Decision
        </div>

        <div className="focus-conflict-actions">
          {decisions.length > 0 && (
            <button
              type="button"
              className="focus-conflict-primary"
              onClick={() =>
                onResolve(
                  decisions,
                )
              }
            >
              {
                decisions.length
                === 1
                  ? decisions[0].label
                  : `Apply ${decisions.length} explicit decisions`
              }
            </button>
          )}

          <button
            type="button"
            className="focus-conflict-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </section>
    </div>
  )
}
