import {
  Layers3,
} from 'lucide-react'

import {
  FOCUS_BUCKETS,
  candidatesForBucket,
  visibleCandidatesForBucket,
} from './focusModel'
import FocusTaskRow from './FocusTaskRow'

export default function FocusBoard({
  data,
  pinnedItemIds,
  onTogglePinned,
  onSetCurrent,
  onComplete,
  onOpenManager,
  onDoToday,
  onAutomatic,
  currentBusy,
  completionBusy,
  planningBusy,
}) {
  return (
    <section
      className="focus-board"
      aria-label="Focus choices"
    >
      {FOCUS_BUCKETS.map(
        (bucket) => {
          const allCandidates =
            candidatesForBucket(
              data?.candidates,
              bucket,
            )

          const visible =
            visibleCandidatesForBucket(
              data?.candidates,
              bucket,
            )

          return (
            <section
              key={bucket.id}
              className="focus-bucket"
            >
              <header className="focus-bucket-header">
                <h2>
                  {bucket.label}
                </h2>

                <button
                  type="button"
                  className="focus-layer-button"
                  aria-label={`Open ${bucket.label} queue`}
                  onClick={() =>
                    onOpenManager(
                      bucket.id,
                    )
                  }
                >
                  <Layers3
                    size={18}
                  />

                  {allCandidates.length > 3 && (
                    <span>
                      {allCandidates.length}
                    </span>
                  )}
                </button>
              </header>

              <div className="focus-bucket-list">
                {visible.length === 0 && (
                  <p className="focus-empty-bucket">
                    Nothing queued here.
                  </p>
                )}

                {visible.map(
                  (candidate) => (
                    <FocusTaskRow
                      key={
                        candidate.item_id
                      }
                      candidate={
                        candidate
                      }
                      today={
                        data.today
                      }
                      pinned={
                        pinnedItemIds.has(
                          candidate.item_id,
                        )
                      }
                      onTogglePinned={
                        onTogglePinned
                      }
                      onSetCurrent={
                        onSetCurrent
                      }
                      onComplete={
                        onComplete
                      }
                      onDoToday={
                        onDoToday
                      }
                      onAutomatic={
                        onAutomatic
                      }
                      currentBusy={
                        currentBusy
                      }
                      completionBusy={
                        completionBusy
                      }
                      planningBusy={
                        planningBusy
                      }
                    />
                  ),
                )}
              </div>
            </section>
          )
        },
      )}
    </section>
  )
}
