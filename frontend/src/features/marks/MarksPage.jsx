import { useState } from 'react'
import { useMarks, useUpdateAssignmentMark } from '../../hooks/useMarks'

export default function MarksPage() {

  const {data: markGroups, isPending, isError, error, refetch,} = useMarks()
  const [editingId, setEditingId] = useState(null)
  const [editedMark, setEditedMark] = useState('')
  const [saveError, setSaveError] = useState('')
  const updateMark = useUpdateAssignmentMark()

  function startEditing(assessment) {
    setEditingId(assessment.id)
    setEditedMark(
        assessment.mark_achieved == null
        ? ''
        : String(assessment.mark_achieved),
    )
    setSaveError('')
    }

    function cancelEditing() {
    setEditingId(null)
    setEditedMark('')
    setSaveError('')
    }

    async function saveMark(assessmentId) {
        if (editedMark.trim() === '') {
            setSaveError('Enter a mark between 0 and 100.')
            return
        }

        const mark = Number(editedMark)

        if (!Number.isFinite(mark) || mark < 0 || mark > 100) {
            setSaveError('Mark must be between 0 and 100.')
            return
        }

        setSaveError('')

        try {
            await updateMark.mutateAsync({ assessmentId, mark })
            cancelEditing()
        } catch {
            setSaveError('Unable to save the mark. Please try again.')
        }
    }

    async function clearMark(assessmentId) {
        setSaveError('')

        try {
            await updateMark.mutateAsync({
            assessmentId,
            mark: null,
            })
            cancelEditing()
        } catch {
            setSaveError('Unable to clear the mark. Please try again.')
        }
        }

  return (
    <div className="min-h-screen px-6 pb-16 pt-28 text-arc-text md:px-16">
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="text-2xl font-semibold">Marks</h1>

        <p className="mt-2 text-sm text-arc-text/70">
          Review your assessment marks and explore hypothetical results.
        </p>

        <div className="mt-6">
          {isPending && (
            <p className="text-sm text-arc-text/70">
              Loading your marks...
            </p>
          )}

          {isError && (
            <div className="rounded-lg border border-red-300 p-4">
              <p className="font-medium">Unable to load your marks.</p>
              <p className="mt-2 text-sm text-arc-text/70">
                {error?.message || 'An unexpected error occurred.'}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 rounded-md border px-3 py-2 text-sm"
              >
                Try again
              </button>
            </div>
          )}

          {!isPending &&
            !isError &&
            Array.isArray(markGroups) &&
            markGroups.length === 0 && (
              <div className="rounded-lg border border-arc-text/15 p-6">
                <h2 className="font-medium">No assessments yet</h2>
                <p className="mt-2 text-sm text-arc-text/70">
                  Your assessments will appear here once they have been
                  added to your planning workspace.
                </p>
              </div>
            )}

          {!isPending &&
            !isError &&
            Array.isArray(markGroups) &&
            markGroups.length > 0 && (
              <div className="space-y-6">
                {markGroups.map((group) => (
                  <section
                    key={group.root.id}
                    className="rounded-lg border border-arc-text/15 p-5"
                  >
                    <h2 className="text-lg font-semibold">
                      {group.root.title}
                    </h2>

                    <p className="mt-1 text-sm text-arc-text/70">
                      {group.assessments.length} assessment
                      {group.assessments.length === 1 ? '' : 's'}
                      {' · '}
                      {group.unmarked_count} unmarked
                    </p>

                    <div className="mt-4 space-y-3">
                      {group.assessments.map((assessment) => (
                        <div
                          key={assessment.id}
                          className="rounded-md bg-arc-text/5 p-4"
                        >
                          <h3 className="font-medium">
                            {assessment.title}
                          </h3>

                          <p className="mt-1 text-sm text-arc-text/70">
                            Weight:{' '}
                            {assessment.weight_percent == null
                              ? 'Not set'
                              : `${assessment.weight_percent}%`}
                          </p>

                          {editingId === assessment.id ? (
                            <div className="mt-3">
                                <label
                                htmlFor={`mark-${assessment.id}`}
                                className="block text-sm text-arc-text/70"
                                >
                                Mark (0–100)
                                </label>

                                <input
                                id={`mark-${assessment.id}`}
                                type="number"
                                min="0"
                                max="100"
                                step="any"
                                value={editedMark}
                                onChange={(event) => setEditedMark(event.target.value)}
                                className="mt-1 w-28 rounded-lg border border-arc-text/20 bg-transparent px-3 py-2 text-arc-text"
                                />

                                <div className="mt-2 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => saveMark(assessment.id)}
                                    disabled={updateMark.isPending}
                                    className="rounded-lg bg-arc-text px-3 py-2 text-sm text-white disabled:opacity-50"
                                >
                                    {updateMark.isPending ? 'Saving...' : 'Save'}
                                </button>

                                {assessment.mark_achieved != null && (
                                    <button
                                        type="button"
                                        onClick={() => clearMark(assessment.id)}
                                        disabled={updateMark.isPending}
                                        className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 disabled:opacity-50"
                                    >
                                        Clear mark
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={cancelEditing}
                                    disabled={updateMark.isPending}
                                    className="rounded-lg border border-arc-text/20 px-3 py-2 text-sm text-arc-text disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                </div>

                                {saveError && (
                                <p role="alert" className="mt-2 text-sm text-red-500">
                                    {saveError}
                                </p>
                                )}
                            </div>
                            ) : (
                            <div className="mt-2 flex items-center gap-3">
                                <p className="text-sm">
                                {assessment.mark_achieved == null
                                    ? 'Unmarked'
                                    : `Recorded mark: ${assessment.mark_achieved}%`}
                                </p>

                                <button
                                type="button"
                                onClick={() => startEditing(assessment)}
                                className="text-sm font-medium text-arc-text underline underline-offset-4"
                                >
                                {assessment.mark_achieved == null ? 'Enter mark' : 'Edit mark'}
                                </button>
                            </div>
                            )}
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 border-t border-arc-text/15 pt-4 text-sm">
                      <p>
                        Total weighting: {group.total_weight}%
                      </p>
                      <p className="mt-1">
                        Recorded contribution: {group.total_marks}
                      </p>
                    </div>
                  </section>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
