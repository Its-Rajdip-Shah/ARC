
import { useEffect, useState } from 'react'
import {useMarks, useUpdateAssignmentMark, useUpdateManualWeight, useSimulateMarks,} from '../../hooks/useMarks'
import { useSyncCanvas } from '../../hooks/useCanvas'


function getSimulatedGrade(group) {
  const markedAssessments = group.assessments.filter(
    (assessment) =>
      assessment.mark_achieved != null &&
      assessment.weight_percent != null,
  )

  const markedWeight = markedAssessments.reduce(
    (total, assessment) =>
      total + Number(assessment.weight_percent),
    0,
  )

  if (markedWeight === 0) return null

  return (Number(group.total_marks) / markedWeight) * 100
}


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
  const updateWeight = useUpdateManualWeight()
  const [canvasSyncMessage, setCanvasSyncMessage] = useState('')
  const [canvasSyncError, setCanvasSyncError] = useState('')
  const [viewMode, setViewMode] = useState('marks')
  const [editedWeight, setEditedWeight] = useState('')
  const [whatIfWeights, setWhatIfWeights] = useState({})

  // Initialize temporary values from saved marks.
  // Refresh them whenever the saved marks query changes.
  useEffect(() => {
    if (!Array.isArray(markGroups)) return

    const initialMarks = {}
    const initialWeights = {}

    markGroups.forEach((group) => {
      group.assessments.forEach((assessment) => {
        initialMarks[assessment.id] =
          assessment.mark_achieved == null
            ? ''
            : String(assessment.mark_achieved)

        initialWeights[assessment.id] =
          assessment.weight_percent == null
            ? ''
            : String(assessment.weight_percent)
      })
    })

    setWhatIfMarks(initialMarks)
    setWhatIfWeights(initialWeights)
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
    setEditedWeight(
      assessment.weight_percent == null
        ? ''
        : String(assessment.weight_percent),
    )

    setSaveError('')
  }


  function cancelEditing() {
    setEditingId(null)
    setEditedMark('')
    setEditedWeight('')
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

  async function saveWeight(assessmentId) {
    const value = editedWeight.trim()
    let weight = null

    if (value !== '') {
      weight = Number(value)

      if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
        setSaveError('Weight must be between 0 and 100.')
        return
      }
    }

    setSaveError('')

    try {
      await updateWeight.mutateAsync({ assessmentId, weight })
    } catch (err) {
      setSaveError(
        err?.response?.data?.detail ||
          'Unable to save the weight. Please try again.',
      )
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

  function changeWhatIfWeight(assessmentId, value) {
    setWhatIfWeights((current) => ({
      ...current,
      [assessmentId]: value,
    }))

    simulation.reset()
    setSimulationError('')
  }

  async function calculateWhatIf() {
    setSimulationError('')

    const entries = []

    for (const group of markGroups ?? []) {
      for (const assessment of group.assessments) {
        const markValue = whatIfMarks[assessment.id] ?? ''
        const weightValue = whatIfWeights[assessment.id] ?? ''

        let mark = null
        if (String(markValue).trim() !== '') {
          mark = Number(markValue)

          if (!Number.isFinite(mark) || mark < 0 || mark > 100) {
            setSimulationError(
              `Enter a mark between 0 and 100 for ${assessment.title}.`,
            )
            return
          }
        }

        let weight = null
        if (String(weightValue).trim() !== '') {
          weight = Number(weightValue)

          if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
            setSimulationError(
              `Enter a weight between 0 and 100 for ${assessment.title}.`,
            )
            return
          }
        }

        const effectiveWeight =
          String(weightValue).trim() !== ''
            ? weight
            : assessment.weight_percent

        // Skip assessments without a saved or temporary weight.
        if (effectiveWeight == null) continue

        entries.push({
          assessment_id: assessment.id,
          mark_achieved: mark,
          weight_percent: weight,
        })
      }
    }

    try {
      await simulation.mutateAsync({ assessments: entries })
    } catch (err) {
      setSimulationError(
        err?.response?.data?.detail ||
          'Unable to calculate the simulation. Please try again.',
      )
    }
  }


  function resetWhatIf() {
    const savedMarks = {}
    const savedWeights = {}

    for (const group of markGroups ?? []) {
      for (const assessment of group.assessments) {
        savedMarks[assessment.id] =
          assessment.mark_achieved == null
            ? ''
            : String(assessment.mark_achieved)

        savedWeights[assessment.id] =
          assessment.weight_percent == null
            ? ''
            : String(assessment.weight_percent)
      }
    }

    setWhatIfMarks(savedMarks)
    setWhatIfWeights(savedWeights)
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
            <>
                    <div className="mt-6 flex gap-2" role="group" aria-label="Marks view">
                      <button
                        type="button"
                        onClick={() => setViewMode('marks')}
                        aria-pressed={viewMode === 'marks'}
                        className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                          viewMode === 'marks'
                            ? 'border-arc-text bg-arc-text/10'
                            : 'border-arc-text/20'
                        }`}
                      >
                        Marks
                      </button>

                      <button
                        type="button"
                        onClick={() => setViewMode('what-if')}
                        aria-pressed={viewMode === 'what-if'}
                        className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                          viewMode === 'what-if'
                            ? 'border-arc-text bg-arc-text/10'
                            : 'border-arc-text/20'
                        }`}
                      >
                        What-If Simulation
                      </button>
                    </div>

            <div className="mt-6 space-y-10">
              {viewMode === 'marks' && (
                <>
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

                                <label
                                  htmlFor={`weight-${assessment.id}`}
                                  className="mt-3 block text-sm text-arc-text/70"
                                >
                                  Manual weight (%)
                                </label>

                                <input
                                  id={`weight-${assessment.id}`}
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="any"
                                  value={editedWeight}
                                  onChange={(event) => setEditedWeight(event.target.value)}
                                  placeholder="Not set"
                                  className="mt-1 w-28 rounded-lg border border-arc-text/20 bg-transparent px-3 py-2 text-arc-text"
                                />

                                <p className="mt-1 text-xs text-arc-text/60">
                                  Canvas weights take priority. Clear this field to remove the manual fallback.
                                </p>

                                <button
                                  type="button"
                                  onClick={() => saveWeight(assessment.id)}
                                  disabled={updateWeight.isPending}
                                  className="mt-3 rounded-lg border border-arc-text/20 px-3 py-2 text-sm font-medium disabled:opacity-50"
                                >
                                  {updateWeight.isPending ? 'Saving...' : 'Save weight'}
                                </button>

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
                    </>
                  )}

              {viewMode === 'what-if' && (
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

                                <div className="flex flex-wrap items-end gap-3"><div>
                                    <label
                                      htmlFor={`whatif-${assessment.id}`}
                                      className="block text-sm"
                                    >
                                      What-if mark (%)
                                    </label>
                                    <input
                                      id={`whatif-${assessment.id}`}
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="any"
                                      disabled={simulation.isPending}
                                      value={whatIfMarks[assessment.id] ?? ''}
                                      onChange={(event) =>
                                        changeWhatIfMark(assessment.id, event.target.value)
                                      }
                                      placeholder="Blank"
                                      className="mt-1 w-28 rounded-lg border border-arc-text/20 bg-transparent px-3 py-2 text-arc-text disabled:opacity-50"
                                    />
                                  </div>

                                  <div>
                                    <label
                                      htmlFor={`whatif-weight-${assessment.id}`}
                                      className="block text-sm"
                                    >
                                      What-if weight (%)
                                    </label>
                                    <input
                                      id={`whatif-weight-${assessment.id}`}
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="any"
                                      disabled={simulation.isPending}
                                      value={whatIfWeights[assessment.id] ?? ''}
                                      onChange={(event) =>
                                        changeWhatIfWeight(assessment.id, event.target.value)
                                      }
                                      placeholder="Saved weight"
                                      className="mt-1 w-28 rounded-lg border border-arc-text/20 bg-transparent px-3 py-2 text-arc-text disabled:opacity-50"
                                    />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {hasSimulation && resultGroup && (
                          <div className="mt-4 border-t border-arc-text/15 pt-4">
                            <p className="text-sm text-arc-text/70">
                              Projected grade across marked assessments
                            </p>

                            <p className="mt-1 text-l font-semibold">
                              {getSimulatedGrade(resultGroup) == null
                                ? 'N/A'
                                : `${getSimulatedGrade(resultGroup).toFixed(2)}%`}
                            </p>

                            <div className="mt-3 space-y-1 text-sm">
                              <p>
                                Contribution toward final grade:{' '}
                                <strong>
                                  {Number(resultGroup.total_marks).toFixed(2)} percentage points
                                </strong>
                              </p>

                              <p>
                                Total assessment weighting:{' '}
                                {Number(resultGroup.total_weight).toFixed(2)}%
                              </p>

                              <p className="text-arc-text/70">
                                Unmarked assessments: {resultGroup.unmarked_count}
                              </p>
                            </div>
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
          )}
         </div>
        </>
      )}
      </div>
    </div>
  )
}
