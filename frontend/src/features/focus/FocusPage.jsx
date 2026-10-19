import {
  useMemo,
  useState,
} from 'react'
import {
  Target,
  X,
} from 'lucide-react'

import {
  useCompleteFocus,
  useDoTodayFocus,
  useFocus,
  useReturnFocusToAutomatic,
  useSetCurrentFocus,
} from '../../hooks/useFocus'
import usePlanningHistory from '../../hooks/usePlanningHistory'
import FocusSearchToolbar from './FocusSearchToolbar'
import useFocusFind from './useFocusFind'
import FocusBoard from './FocusBoard'
import FocusConflictDialog from './FocusConflictDialog'
import FocusQueueManager from './FocusQueueManager'
import FocusSchedulerMascot from './FocusSchedulerMascot'
import {
  bucketForCandidate,
  hierarchyPaths,
} from './focusModel'

import './Focus.css'

const EMPTY_CANDIDATES = []

function messageFromError(error) {
  return (
    error?.response
      ?.data?.detail
    ?? error?.message
    ?? 'Something went wrong.'
  )
}

export default function FocusPage() {
  const focusQuery =
    useFocus()

  const history =
    usePlanningHistory()

  const setCurrent =
    useSetCurrentFocus()

  const complete =
    useCompleteFocus()

  const doToday =
    useDoTodayFocus()

  const automatic =
    useReturnFocusToAutomatic()

  const [
    pinnedItemIds,
    setPinnedItemIds,
  ] = useState(
    () => new Set(),
  )

  const [
    managerBucketId,
    setManagerBucketId,
  ] = useState(null)

  const [
    error,
    setError,
  ] = useState(null)

  const [
    conflict,
    setConflict,
  ] = useState(null)

  const data =
    focusQuery.data

  const candidates =
    data?.candidates
    ?? EMPTY_CANDIDATES

  const paths =
    useMemo(
      () =>
        hierarchyPaths(
          candidates,
        ),
      [
        candidates,
      ],
    )

  const find =
    useFocusFind(
      candidates,
      paths,
      {
        onNavigate(row) {
          const bucket =
            bucketForCandidate(
              row,
            )

          if (bucket) {
            setManagerBucketId(
              bucket.id,
            )
          }
        },
      },
    )

  const currentBusy =
    setCurrent.isPending

  const completionBusy =
    complete.isPending

  const planningBusy =
    doToday.isPending
    || history.busy

  const currentCandidate =
    candidates.find(
      (candidate) =>
        candidate.item_id
        === data
          ?.current_item_id,
    )
    ?? null

  function togglePinned(itemId) {
    setPinnedItemIds(
      (current) => {
        const next =
          new Set(
            current,
          )

        if (
          next.has(
            itemId,
          )
        ) {
          next.delete(
            itemId,
          )
        } else {
          next.add(
            itemId,
          )
        }

        return next
      },
    )
  }

  function setCurrentCandidate(
    candidate,
  ) {
    setError(null)

    setCurrent.mutate(
      {
        item_id:
          candidate.is_current
            ? null
            : candidate.item_id,
      },
      {
        onError(errorValue) {
          setError(
            messageFromError(
              errorValue,
            ),
          )
        },
      },
    )
  }

  function clearCurrent() {
    setError(null)

    setCurrent.mutate(
      {
        item_id: null,
      },
      {
        onError(errorValue) {
          setError(
            messageFromError(
              errorValue,
            ),
          )
        },
      },
    )
  }

  function completeCandidate(
    candidate,
  ) {
    setError(null)

    complete.mutate(
      {
        itemId:
          candidate.item_id,
        completed:
          true,
      },
      {
        onError(errorValue) {
          setError(
            messageFromError(
              errorValue,
            ),
          )
        },
      },
    )
  }

  function promote(
    candidate,
    overrides = {},
  ) {
    setError(null)

    doToday.mutate(
      {
        item_id:
          candidate.item_id,
        ...overrides,
      },
      {
        onSuccess() {
          setConflict(null)
        },

        onError(errorValue) {
          if (
            errorValue
              ?.response
              ?.status
            === 409
          ) {
            setConflict({
              candidate,
              data:
                errorValue
                  .response
                  .data,
              overrides,
            })

            return
          }

          setError(
            messageFromError(
              errorValue,
            ),
          )
        },
      },
    )
  }

  function resolveConflict(
    decision,
  ) {
    if (!conflict) {
      return
    }

    promote(
      conflict.candidate,
      {
        ...conflict.overrides,
        [decision]:
          true,
      },
    )
  }

  function returnAutomatic(
    candidate,
  ) {
    setError(null)

    automatic.mutate(
      {
        item_id:
          candidate.item_id,
      },
      {
        onError(errorValue) {
          setError(
            messageFromError(
              errorValue,
            ),
          )
        },
      },
    )
  }

  const empty =
    candidates.length === 0

  return (
    <div className="focus-page">
      <main className="focus-content">
        <h1 className="sr-only">FOCUS</h1>
        {focusQuery.isLoading ? (
          <p className="focus-state-message" role="status">Loading Focus…</p>
        ) : focusQuery.isError ? (
          <p className="focus-state-message" role="alert">Focus could not be loaded.</p>
        ) : (
          <>
        {currentCandidate && (
          <button
            type="button"
            className="focus-current-chip"
            onClick={
              clearCurrent
            }
            title="Clear current focus"
          >
            <Target
              size={17}
              strokeWidth={2}
            />

            <span>
              {currentCandidate.title}
            </span>

            <X
              size={14}
              strokeWidth={2}
            />
          </button>
        )}

        <FocusSearchToolbar
          find={find}
          canUndo={
            history.canUndo
          }
          canRedo={
            history.canRedo
          }
          onUndo={
            history.undo
          }
          onRedo={
            history.redo
          }
          busy={
            history.busy
          }
          findLabel="Find across Focus"
          toolsLabel="Focus tools"
          placeholder="Find across Focus…"
          className="focus-toolbar"
          arrowKeyNavigation
        />

        {error && (
          <div
            className="focus-error-banner"
            role="alert"
          >
            {error}
          </div>
        )}

        {empty
          ? (
            <section className="focus-empty-state">
              <h2>
                Nothing is scheduled yet.
              </h2>

              <p>
                Once Timeline has scheduled work,
                your Focus choices will appear here.
              </p>
            </section>
          )
          : (
            <FocusBoard
              data={data}
              pinnedItemIds={
                pinnedItemIds
              }
              onTogglePinned={
                togglePinned
              }
              onSetCurrent={
                setCurrentCandidate
              }
              onComplete={
                completeCandidate
              }
              onOpenManager={(bucketId) =>
                setManagerBucketId(
                  (current) =>
                    current === bucketId
                      ? null
                      : bucketId,
                )
              }
              onDoToday={
                promote
              }
              onAutomatic={
                returnAutomatic
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
          )}
          </>
        )}
      </main>

      <FocusSchedulerMascot />

      {managerBucketId && (
        <FocusQueueManager
          bucketId={
            managerBucketId
          }
          data={data}
          globalFind={find}
          pinnedItemIds={
            pinnedItemIds
          }
          onTogglePinned={
            togglePinned
          }
          onSetCurrent={
            setCurrentCandidate
          }
          onComplete={
            completeCandidate
          }
          onClose={() =>
            setManagerBucketId(
              null,
            )
          }
          onDoToday={
            promote
          }
          onAutomatic={
            returnAutomatic
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
      )}

      <FocusConflictDialog
        conflict={conflict}
        onCancel={() =>
          setConflict(null)
        }
        onResolve={
          resolveConflict
        }
      />
    </div>
  )
}
