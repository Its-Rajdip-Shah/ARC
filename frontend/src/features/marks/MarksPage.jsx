
import { useEffect, useState } from 'react'
import {useMarks, useUpdateAssignmentMark, useSimulateMarks,} from '../../hooks/useMarks'
import { useSyncCanvas } from '../../hooks/useCanvas'

export default function MarksPage() {
  const {data: markGroups, isPending, isError, error, refetch,} = useMarks()

  const [editingId, setEditingId] = useState(null)
  const [editedMark, setEditedMark] = useState('')
  const [saveError, setSaveError] = useState('')

  const [whatIfMarks, setWhatIfMarks] = useState({})
  const [simulationError, setSimulationError] = useState('')

  const updateMark = useUpdateAssignmentMark()
  const simulation = useSimulateMarks()
  const canvasSync = useSyncCanvas()
  const [canvasSyncMessage, setCanvasSyncMessage] = useState('')
  const [canvasSyncError, setCanvasSyncError] = useState('')

  // Initialize temporary values from saved marks.
  // Refresh them whenever the saved marks query changes.
  useEffect(() => {
    if (!Array.isArray(markGroups)) return

    const initialMarks = {}

    markGroups.forEach((group) => {
      group.assessments.forEach((assessment) => {
        initialMarks[assessment.id] =
          assessment.mark_achieved == null
            ? ''
            : String(assessment.mark_achieved)
      })
    })

    setWhatIfMarks(initialMarks)
    simulation.reset()
    setSimulationError('')
  }, [markGroups])

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

  async function handleCanvasSync() {
    setCanvasSyncMessage('')
    setCanvasSyncError('')

    try {
      await canvasSync.mutateAsync()
      setCanvasSyncMessage('Canvas grades synced successfully.')
    } catch (err) {
      setCanvasSyncError(
        err?.response?.data?.detail ||
          err?.message ||
          'Unable to sync Canvas grades. Please try again.',
      )
    }
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

  function changeWhatIfMark(assessmentId, value) {
    setWhatIfMarks((current) => ({
      ...current,
      [assessmentId]: value,
    }))

    // The displayed result must not be mistaken for the
    // result of the newly edited hypothetical values.
    simulation.reset()
    setSimulationError('')
  }

  async function calculateWhatIf() {
    setSimulationError('')

    const entries = []

    for (const group of markGroups ?? []) {
      for (const assessment of group.assessments) {
        // The backend requires a weighting for simulation.
        if (assessment.weight_percent == null) continue

        const value = whatIfMarks[assessment.id] ?? ''
        let mark = null

        if (value.trim() !== '') {
          mark = Number(value)

          if (
            !Number.isFinite(mark) ||
            mark < 0 ||
            mark > 100
          ) {
            setSimulationError(
              `Enter a valid mark between 0 and 100 for "${assessment.title}", or leave it blank.`,
            )
            return
          }
        }

        entries.push({
          assessment_id: assessment.id,
          mark_achieved: mark,
        })
      }
    }

    if (entries.length === 0) {
      setSimulationError(
        'There are no weighted assessments available to simulate.',
      )
      return
    }

    try {
      await simulation.mutateAsync({ marks: entries })
    } catch {
      setSimulationError(
        'Unable to calculate the hypothetical results. Please try again.',
      )
    }
  }

  function resetWhatIf() {
    const savedMarks = {}

    for (const group of markGroups ?? []) {
      for (const assessment of group.assessments) {
        savedMarks[assessment.id] =
          assessment.mark_achieved == null
            ? ''
            : String(assessment.mark_achieved)
      }
    }

    setWhatIfMarks(savedMarks)
    simulation.reset()
    setSimulationError('')
  }

  const simulatedGroups = simulation.data
  const hasSimulation = Array.isArray(simulatedGroups)

  return (
    <div className="min-h-screen px-6 pb-16 pt-28 text-arc-text md:px-16">
      <div className="mx-auto w-full max-w-5xl">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold">Marks</h1>

          <button
            type="button"
            onClick={handleCanvasSync}
            disabled={canvasSync.isPending}
            className="rounded-md border border-arc-text/20 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {canvasSync.isPending ? 'Syncing Canvas...' : 'Sync Canvas Grades'}
          </button>
        </div>

        <p className="mt-2 text-sm text-arc-text/70">
          Review your assessment marks and explore hypothetical results.
        </p>

        {canvasSyncMessage && (
          <p role="status" className="mt-3 text-sm text-green-700">
            {canvasSyncMessage}
          </p>
        )}

        {canvasSyncError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {canvasSyncError}
          </p>
        )}


        {isPending && (
          <p className="mt-6 text-sm text-arc-text/70">
            Loading your marks...
          </p>
        )}

        {isError && (
          <div className="mt-6 rounded-lg border border-red-300 p-4">
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
            <div className="mt-6 rounded-lg border border-arc-text/15 p-6">
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
            <div className="mt-6 space-y-10">
              {/* Saved marks: existing edit/save/clear workflow */}
              <section>
                <h2 className="text-xl font-semibold">Recorded Marks</h2>
                <p className="mt-1 text-sm text-arc-text/70">
                  These are your saved marks. Changes made here are
                  separate from the What-If Simulator below.
                </p>

                <div className="mt-4 space-y-6">
                  {markGroups.map((group) => (
                    <section
                      key={group.root.id}
                      className="rounded-lg border border-arc-text/15 p-5"
                    >
                      <h3 className="text-lg font-semibold">
                        {group.root.title}
                      </h3>

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
                            <h4 className="font-medium">
                              {assessment.title}
                            </h4>

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
                                  onChange={(event) =>
                                    setEditedMark(event.target.value)
                                  }
                                  className="mt-1 w-28 rounded-lg border border-arc-text/20 bg-transparent px-3 py-2 text-arc-text"
                                />

                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => saveMark(assessment.id)}
                                    disabled={updateMark.isPending}
                                    className="rounded-lg border border-arc-text/20 px-3 py-2 text-sm font-medium disabled:opacity-50"
                                  >
                                    {updateMark.isPending
                                      ? 'Saving...'
                                      : 'Save'}
                                  </button>

                                  {assessment.mark_achieved != null && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        clearMark(assessment.id)
                                      }
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
                                    className="rounded-lg border border-arc-text/20 px-3 py-2 text-sm disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                </div>

                                {saveError && (
                                  <p
                                    role="alert"
                                    className="mt-2 text-sm text-red-500"
                                  >
                                    {saveError}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="mt-2 flex flex-wrap items-center gap-3">
                                <p className="text-sm">
                                  {assessment.mark_achieved == null
                                    ? 'Unmarked'
                                    : `Recorded mark: ${assessment.mark_achieved}%`}
                                </p>

                                <button
                                  type="button"
                                  onClick={() =>
                                    startEditing(assessment)
                                  }
                                  className="text-sm font-medium underline underline-offset-4"
                                >
                                  {assessment.mark_achieved == null
                                    ? 'Enter mark'
                                    : 'Edit mark'}
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
              </section>

              {/* What-If: temporary state and simulation API only */}
              <section className="rounded-xl border border-arc-text/20 p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">
                      What-If Simulator
                    </h2>
                    <p className="mt-2 text-sm text-arc-text/70">
                      Experiment with different marks and see how your
                      weighted contributions change. These values are
                      temporary and will not update your saved marks.
                    </p>
                  </div>

                  <span className="rounded-full border border-arc-text/20 px-3 py-1 text-xs">
                    Simulation only
                  </span>
                </div>

                <div className="mt-5 space-y-6">
                  {markGroups.map((group) => {
                    const resultGroup = hasSimulation
                      ? simulatedGroups.find(
                          (result) => result.root.id === group.root.id,
                        )
                      : null

                    return (
                      <section
                        key={group.root.id}
                        className="rounded-lg bg-arc-text/5 p-4"
                      >
                        <h3 className="font-semibold">
                          {group.root.title}
                        </h3>

                        <div className="mt-3 space-y-3">
                          {group.assessments.map((assessment) => {
                            const hasWeight =
                              assessment.weight_percent != null

                            return (
                              <div
                                key={assessment.id}
                                className="flex flex-col gap-2 rounded-md border border-arc-text/10 p-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium">
                                    {assessment.title}
                                  </p>
                                  <p className="mt-1 text-xs text-arc-text/70">
                                    Weight:{' '}
                                    {hasWeight
                                      ? `${assessment.weight_percent}%`
                                      : 'Not set'}
                                    {' · '}
                                    Saved:{' '}
                                    {assessment.mark_achieved == null
                                      ? 'Unmarked'
                                      : `${assessment.mark_achieved}%`}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <label
                                    htmlFor={`whatif-${assessment.id}`}
                                    className="text-sm"
                                  >
                                    What-if mark
                                  </label>
                                  <input
                                    id={`whatif-${assessment.id}`}
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="any"
                                    disabled={!hasWeight || simulation.isPending}
                                    value={whatIfMarks[assessment.id] ?? ''}
                                    onChange={(event) =>
                                      changeWhatIfMark(
                                        assessment.id,
                                        event.target.value,
                                      )
                                    }
                                    placeholder="Blank"
                                    title={
                                      hasWeight
                                        ? 'Enter a mark from 0 to 100, or leave blank'
                                        : 'Set a weighting before simulating this assessment'
                                    }
                                    className="w-28 rounded-lg border border-arc-text/20 bg-transparent px-3 py-2 text-arc-text disabled:cursor-not-allowed disabled:opacity-50"
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {hasSimulation && resultGroup && (
                          <div className="mt-4 border-t border-arc-text/15 pt-4 text-sm">
                            <p>
                              Simulated contribution:{' '}
                              <strong>{resultGroup.total_marks}</strong>
                            </p>
                            <p className="mt-1 text-arc-text/70">
                              Unmarked assessments:{' '}
                              {resultGroup.unmarked_count}
                            </p>
                          </div>
                        )}
                      </section>
                    )
                  })}
                </div>

                {simulationError && (
                  <p role="alert" className="mt-4 text-sm text-red-500">
                    {simulationError}
                  </p>
                )}

                {simulation.isError && !simulationError && (
                  <p role="alert" className="mt-4 text-sm text-red-500">
                    The simulation failed. Please try again.
                  </p>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={calculateWhatIf}
                    disabled={simulation.isPending}
                    className="rounded-lg border border-arc-text/20 px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                  >
                    {simulation.isPending
                      ? 'Calculating...'
                      : 'Calculate What-If'}
                  </button>

                  <button
                    type="button"
                    onClick={resetWhatIf}
                    disabled={simulation.isPending}
                    className="rounded-lg border border-arc-text/20 px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                  >
                    Reset to saved marks
                  </button>
                </div>

                <p className="mt-3 text-xs text-arc-text/60">
                  Blank means unmarked; 0 is a valid mark. Assessments
                  without a weighting are excluded from the calculation.
                  Reset restores the latest saved marks.
                </p>
              </section>
            </div>
          )}
      </div>
    </div>
  )
}
