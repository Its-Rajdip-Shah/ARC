import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useMarks,
  useUpdateAssignmentMark,
  useUpdateManualWeight,
  useSimulateMarks,
  useReorderMarks,
  useCreateAssessment,
  useDeleteAssessment,
} from "../../hooks/useMarks";
import { useSyncCanvas } from "../../hooks/useCanvas";

function getSimulatedGrade(group) {
  const markedAssessments = group.assessments.filter(
    (assessment) =>
      assessment.mark_achieved != null && assessment.weight_percent != null,
  );

  const markedWeight = markedAssessments.reduce(
    (total, assessment) => total + Number(assessment.weight_percent),
    0,
  );

  if (markedWeight === 0) return null;

  return (Number(group.total_marks) / markedWeight) * 100;
}

function SortableAssessmentRow({ assessment, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: assessment.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`min-w-0 rounded-md border border-white/5 bg-[#2D3766] px-1.5 py-0.5 ${
        isDragging ? "z-10 opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${assessment.title}`}
          title="Drag to reorder"
          className="cursor-grab touch-none rounded px-1 text-white/60 hover:bg-white/10 active:cursor-grabbing"
        >
          ⠿
        </button>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

export default function MarksPage() {
  const { data: markGroups, isPending, isError, error, refetch } = useMarks();

  const [editingId, setEditingId] = useState(null);
  const [editedMark, setEditedMark] = useState("");
  const [saveError, setSaveError] = useState("");

  const [savedMarkDrafts, setSavedMarkDrafts] = useState({});
  const [savedWeightDrafts, setSavedWeightDrafts] = useState({});

  const [whatIfMarks, setWhatIfMarks] = useState({});
  const [simulationError, setSimulationError] = useState("");

  const updateMark = useUpdateAssignmentMark();
  const simulation = useSimulateMarks();
  const canvasSync = useSyncCanvas();
  const updateWeight = useUpdateManualWeight();
  const [canvasSyncMessage, setCanvasSyncMessage] = useState("");
  const [canvasSyncError, setCanvasSyncError] = useState("");
  const [viewMode, setViewMode] = useState("marks");
  const [editedWeight, setEditedWeight] = useState("");
  const [whatIfWeights, setWhatIfWeights] = useState({});

  const reorderMutation = useReorderMarks();
  const createAssessment = useCreateAssessment();
  const deleteAssessment = useDeleteAssessment();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const [addingToGroup, setAddingToGroup] = useState(null);
  const [newAssessmentTitle, setNewAssessmentTitle] = useState("");
  const [newAssessmentWeight, setNewAssessmentWeight] = useState("");
  const [assessmentError, setAssessmentError] = useState("");

  // Initialize temporary values from saved marks.
  // Refresh them whenever the saved marks query changes.
  useEffect(() => {
    if (!Array.isArray(markGroups)) return;

    const initialMarks = {};
    const initialWeights = {};

    markGroups.forEach((group) => {
      group.assessments.forEach((assessment) => {
        initialMarks[assessment.id] =
          assessment.mark_achieved == null
            ? ""
            : String(assessment.mark_achieved);

        initialWeights[assessment.id] =
          assessment.weight_percent == null
            ? ""
            : String(assessment.weight_percent);
      });
    });

    setSavedMarkDrafts(initialMarks);
    setSavedWeightDrafts(initialWeights);
    setWhatIfMarks(initialMarks);
    setWhatIfWeights(initialWeights);
    simulation.reset();
    setSimulationError("");
  }, [markGroups]);

  function startEditing(assessment) {
    setEditingId(assessment.id);
    setEditedMark(
      assessment.mark_achieved == null ? "" : String(assessment.mark_achieved),
    );
    setEditedWeight(
      assessment.weight_percent == null
        ? ""
        : String(assessment.weight_percent),
    );

    setSaveError("");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditedMark("");
    setEditedWeight("");
    setSaveError("");
  }

  async function handleCanvasSync() {
    setCanvasSyncMessage("");
    setCanvasSyncError("");

    try {
      await canvasSync.mutateAsync();
      setCanvasSyncMessage("Canvas grades synced successfully.");
    } catch (err) {
      setCanvasSyncError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to sync Canvas grades. Please try again.",
      );
    }
  }

  async function saveInlineMark(assessment, value) {
    const trimmed = String(value).trim();

    if (trimmed === "") {
      if (assessment.mark_achieved == null) return;

      setSaveError("");

      try {
        await updateMark.mutateAsync({
          assessmentId: assessment.id,
          mark: null,
        });
      } catch {
        setSaveError("Unable to clear the mark. Please try again.");
      }

      return;
    }

    const mark = Number(trimmed);

    if (!Number.isFinite(mark) || mark < 0 || mark > 100) {
      setSaveError("Mark must be between 0 and 100.");
      return;
    }

    setSaveError("");

    try {
      await updateMark.mutateAsync({
        assessmentId: assessment.id,
        mark,
      });
    } catch {
      setSaveError("Unable to save the mark. Please try again.");
    }
  }

  async function saveInlineWeight(assessmentId, value) {
    const trimmed = String(value).trim();
    const weight = trimmed === "" ? null : Number(trimmed);

    if (
      weight !== null &&
      (!Number.isFinite(weight) || weight < 0 || weight > 100)
    ) {
      setSaveError("Weight must be between 0 and 100.");
      return;
    }

    setSaveError("");

    try {
      await updateWeight.mutateAsync({ assessmentId, weight });
    } catch {
      setSaveError("Unable to save the weight. Please try again.");
    }
  }

  async function saveMark(assessmentId) {
    if (editedMark.trim() === "") {
      setSaveError("Enter a mark between 0 and 100.");
      return;
    }

    const mark = Number(editedMark);

    if (!Number.isFinite(mark) || mark < 0 || mark > 100) {
      setSaveError("Mark must be between 0 and 100.");
      return;
    }

    setSaveError("");

    try {
      await updateMark.mutateAsync({ assessmentId, mark });
      cancelEditing();
    } catch {
      setSaveError("Unable to save the mark. Please try again.");
    }
  }

  async function saveWeight(assessmentId) {
    const value = editedWeight.trim();
    let weight = null;

    if (value !== "") {
      weight = Number(value);

      if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
        setSaveError("Weight must be between 0 and 100.");
        return;
      }
    }

    setSaveError("");

    try {
      await updateWeight.mutateAsync({ assessmentId, weight });
    } catch (err) {
      setSaveError(
        err?.response?.data?.detail ||
          "Unable to save the weight. Please try again.",
      );
    }
  }

  async function clearMark(assessmentId) {
    setSaveError("");

    try {
      await updateMark.mutateAsync({
        assessmentId,
        mark: null,
      });
      cancelEditing();
    } catch {
      setSaveError("Unable to clear the mark. Please try again.");
    }
  }

  function changeWhatIfMark(assessmentId, value) {
    setWhatIfMarks((current) => ({
      ...current,
      [assessmentId]: value,
    }));

    // The displayed result must not be mistaken for the
    // result of the newly edited hypothetical values.
    simulation.reset();
    setSimulationError("");
  }

  function changeWhatIfWeight(assessmentId, value) {
    setWhatIfWeights((current) => ({
      ...current,
      [assessmentId]: value,
    }));

    simulation.reset();
    setSimulationError("");
  }

  async function calculateWhatIf() {
    setSimulationError("");

    const entries = [];

    for (const group of markGroups ?? []) {
      for (const assessment of group.assessments) {
        const markValue = whatIfMarks[assessment.id] ?? "";
        const weightValue = whatIfWeights[assessment.id] ?? "";

        let mark = null;
        if (String(markValue).trim() !== "") {
          mark = Number(markValue);

          if (!Number.isFinite(mark) || mark < 0 || mark > 100) {
            setSimulationError(
              `Enter a mark between 0 and 100 for ${assessment.title}.`,
            );
            return;
          }
        }

        let weight = null;
        if (String(weightValue).trim() !== "") {
          weight = Number(weightValue);

          if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
            setSimulationError(
              `Enter a weight between 0 and 100 for ${assessment.title}.`,
            );
            return;
          }
        }

        const effectiveWeight =
          String(weightValue).trim() !== ""
            ? weight
            : assessment.weight_percent;

        // Skip assessments without a saved or temporary weight.
        if (effectiveWeight == null) continue;

        entries.push({
          assessment_id: assessment.id,
          mark_achieved: mark,
          weight_percent: weight,
        });
      }
    }

    if (entries.length === 0) {
      simulation.reset();
      return;
    }

    try {
      await simulation.mutateAsync({ assessments: entries });
    } catch (err) {
      setSimulationError(
        err?.response?.data?.detail ||
          "Unable to calculate the simulation. Please try again.",
      );
    }
  }

  useEffect(() => {
    if (viewMode !== "what-if") return;
    if (!Array.isArray(markGroups) || markGroups.length === 0) return;

    const timeoutId = setTimeout(() => {
      calculateWhatIf();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [viewMode, whatIfMarks, whatIfWeights, markGroups]);

  function resetWhatIf() {
    const savedMarks = {};
    const savedWeights = {};

    for (const group of markGroups ?? []) {
      for (const assessment of group.assessments) {
        savedMarks[assessment.id] =
          assessment.mark_achieved == null
            ? ""
            : String(assessment.mark_achieved);

        savedWeights[assessment.id] =
          assessment.weight_percent == null
            ? ""
            : String(assessment.weight_percent);
      }
    }

    setWhatIfMarks(savedMarks);
    setWhatIfWeights(savedWeights);
    simulation.reset();
    setSimulationError("");
  }

  async function handleCreateAssessment(group) {
    const title = newAssessmentTitle.trim();
    const weightText = newAssessmentWeight.trim();

    if (!title) {
      setAssessmentError("Enter an assessment name.");
      return;
    }

    let weight = null;

    if (weightText !== "") {
      weight = Number(weightText);

      if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
        setAssessmentError("Weight must be between 0 and 100.");
        return;
      }
    }

    setAssessmentError("");

    const payload = {
      parent: group.root.id,
      item_type: "ASSIGNMENT",
      title,
      description: "",
      tag_ids: [],
    };

    if (weight !== null) {
      payload.assignment_detail = {
        weight_percent: weight,
      };
    }

    try {
      await createAssessment.mutateAsync(payload);
      setNewAssessmentTitle("");
      setNewAssessmentWeight("");
      setAddingToGroup(null);
    } catch (err) {
      setAssessmentError(
        err?.response?.data?.detail ||
          "Unable to create the assessment. Please try again.",
      );
    }
  }

  async function handleDeleteAssessment(assessment) {
    const confirmed = window.confirm(
      `Delete "${assessment.title}"? This will permanently remove the assessment.`,
    );

    if (!confirmed) return;

    setAssessmentError("");

    try {
      await deleteAssessment.mutateAsync(assessment.id);

      if (editingId === assessment.id) {
        cancelEditing();
      }
    } catch (err) {
      setAssessmentError(
        err?.response?.data?.detail ||
          "Unable to delete the assessment. Please try again.",
      );
    }
  }

  async function handleAssessmentDragEnd(group, event) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const groupIds = group.assessments.map((assessment) => assessment.id);
    const oldIndex = groupIds.indexOf(active.id);
    const newIndex = groupIds.indexOf(over.id);

    if (oldIndex < 0 || newIndex < 0) return;

    const reorderedGroupIds = arrayMove(groupIds, oldIndex, newIndex);

    // Send all assessments in their displayed group order because the
    // current endpoint assigns positions across the submitted IDs.
    const allOrderedIds = (markGroups ?? []).flatMap((currentGroup) =>
      currentGroup.root.id === group.root.id
        ? reorderedGroupIds
        : currentGroup.assessments.map((assessment) => assessment.id),
    );

    try {
      setAssessmentError("");
      await reorderMutation.mutateAsync({
        ordered_ids: allOrderedIds,
      });
    } catch (err) {
      setAssessmentError(
        err?.response?.data?.detail ||
          "Unable to reorder assessments. Please try again.",
      );
    }
  }

  const simulatedGroups = simulation.data;
  const hasSimulation = Array.isArray(simulatedGroups);

  return (
    <div className="min-h-screen bg-[#1D224C] px-4 pb-12 pt-24 text-white sm:px-6 md:px-10 lg:px-16">
      <div className="mx-auto w-full max-w-none">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold uppercase tracking-wider">Marks</h1>

          <button
            type="button"
            onClick={handleCanvasSync}
            disabled={canvasSync.isPending}
            className="rounded-lg border border-white/20 px-3 py-2 text-xs font-medium hover:bg-white/10 disabled:opacity-50"
          >
            {canvasSync.isPending ? "Syncing..." : "Sync Canvas"}
          </button>
        </div>

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
          <p className="mt-6 text-sm text-arc-text/70">Loading your marks...</p>
        )}

        {isError && (
          <div className="mt-6 rounded-lg border border-red-300 p-4">
            <p className="font-medium">Unable to load your marks.</p>
            <p className="mt-2 text-sm text-arc-text/70">
              {error?.message || "An unexpected error occurred."}
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
                Your assessments will appear here once they have been added to
                your planning workspace.
              </p>
            </div>
          )}

        {!isPending &&
          !isError &&
          Array.isArray(markGroups) &&
          markGroups.length > 0 && (
            <>
              <div
                className="mt-3 flex justify-center"
                role="group"
                aria-label="Marks view"
              >
                <div className="flex rounded-full bg-[#343B6B] p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("marks")}
                    aria-pressed={viewMode === "marks"}
                    className={`rounded-full px-3 py-1 text-sm ${
                      viewMode === "marks"
                        ? "bg-[#5A689B] font-semibold text-white"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    Marks
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewMode("what-if")}
                    aria-pressed={viewMode === "what-if"}
                    className={`rounded-full px-5 py-2 text-sm ${
                      viewMode === "what-if"
                        ? "bg-[#5A689B] font-semibold text-white"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    What-If
                  </button>
                </div>
              </div>

              <div className="mt-6 space-y-10">
                {viewMode === "marks" && (
                  <>
                    {/* Saved marks: existing edit/save/clear workflow */}
                    <section>

                      <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2">
                        {markGroups.map((group) => (
                          <section
                            key={group.root.id}
                            className="min-w-0 bg-transparent p-1.5"
                          >
                            <h3 className="inline-flex rounded-full bg-[#48588B] px-4 py-1.5 text-sm font-semibold">
                              {group.root.title}
                            </h3>

                            <p className="mt-2 text-xs text-white/60">
                              {group.assessments.length}{' '}
                              assessment{group.assessments.length === 1 ? '' : 's'}
                              {" · "}
                              {group.unmarked_count} unmarked
                            </p>

                            <div className="mt-2 space-y-1">
                              <div className="mb-1 grid grid-cols-[minmax(0,1fr)_76px_76px] gap-1 px-1 text-[11px] font-semibold text-white/60">
                                <span>Assessment</span>
                                <span>Weight</span>
                                <span>Mark received</span>
                              </div>
                              <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={(event) =>
                                  handleAssessmentDragEnd(group, event)
                                }
                              >
                                <SortableContext
                                  items={group.assessments.map(
                                    (assessment) => assessment.id,
                                  )}
                                  strategy={verticalListSortingStrategy}
                                >
                                  {group.assessments.map((assessment) => (
                                    <SortableAssessmentRow
                                      key={assessment.id}
                                      assessment={assessment}
                                    >
                                      <div className="grid min-h-[52px] min-w-0 grid-cols-[minmax(0,1fr)_80px_80px] items-center gap-2 rounded-md border border-white/5 bg-[#2D3766] px-2 py-2">
                                        <div className="flex min-w-0 items-center justify-between gap-1">
                                          <h4 className="min-w-0 break-words text-xs font-medium">
                                            {assessment.title}
                                          </h4>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleDeleteAssessment(assessment)
                                            }
                                            aria-label={`Delete ${assessment.title}`}
                                            title="Delete assessment"
                                            className="shrink-0 rounded px-1.5 py-1 text-xs text-white/60 hover:bg-red-500/20 hover:text-red-300"
                                          >
                                            ×
                                          </button>
                                        </div>

                                        <div>
                                          <input
                                            aria-label={`Weight for ${assessment.title}`}
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="any"
                                            value={
                                              savedWeightDrafts[
                                                assessment.id
                                              ] ?? ""
                                            }
                                            onChange={(event) =>
                                              setSavedWeightDrafts(
                                                (current) => ({
                                                  ...current,
                                                  [assessment.id]:
                                                    event.target.value,
                                                }),
                                              )
                                            }
                                            onBlur={(event) =>
                                              saveInlineWeight(
                                                assessment.id,
                                                event.currentTarget.value,
                                              )
                                            }
                                            placeholder="—"
                                            className="w-full min-w-0 rounded-md border border-white/15 bg-[#1D224C] px-1.5 py-1 text-xs text-white"
                                          />
                                        </div>

                                        <div className="min-w-0">
                                          <input
                                            aria-label={`Mark for ${assessment.title}`}
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="any"
                                            value={
                                              savedMarkDrafts[assessment.id] ??
                                              ""
                                            }
                                            onChange={(event) =>
                                              setSavedMarkDrafts((current) => ({
                                                ...current,
                                                [assessment.id]:
                                                  event.target.value,
                                              }))
                                            }
                                            onBlur={(event) =>
                                              saveInlineMark(
                                                assessment,
                                                event.currentTarget.value,
                                              )
                                            }
                                            placeholder="—"
                                            className="w-full min-w-0 rounded-md border border-white/15 bg-[#1D224C] px-1.5 py-1 text-xs text-white"
                                          />
                                        </div>
                                      </div>
                                    </SortableAssessmentRow>
                                  ))}
                                </SortableContext>
                              </DndContext>
                            </div>

                            <div className="mt-3">
                              {addingToGroup === group.root.id ? (
                                <form
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    handleCreateAssessment(group);
                                  }}
                                  className="space-y-2 rounded-lg border border-white/10 bg-[#252B56] p-3"
                                >
                                  <input
                                    autoFocus
                                    value={newAssessmentTitle}
                                    onChange={(event) =>
                                      setNewAssessmentTitle(event.target.value)
                                    }
                                    placeholder="Assessment name"
                                    aria-label="Assessment name"
                                    className="w-full rounded-md border border-white/15 bg-[#1D224C] px-3 py-2 text-sm text-white"
                                  />

                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="any"
                                    value={newAssessmentWeight}
                                    onChange={(event) =>
                                      setNewAssessmentWeight(event.target.value)
                                    }
                                    placeholder="Weight (%) — optional"
                                    aria-label="Assessment weight"
                                    className="w-full rounded-md border border-white/15 bg-[#1D224C] px-3 py-2 text-sm text-white"
                                  />

                                  {assessmentError && (
                                    <p
                                      role="alert"
                                      className="text-xs text-red-300"
                                    >
                                      {assessmentError}
                                    </p>
                                  )}

                                  <div className="flex gap-2">
                                    <button
                                      type="submit"
                                      disabled={createAssessment.isPending}
                                      className="rounded-md bg-[#5A689B] px-3 py-2 text-xs font-medium disabled:opacity-50"
                                    >
                                      {createAssessment.isPending
                                        ? "Adding..."
                                        : "Add assessment"}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAddingToGroup(null);
                                        setNewAssessmentTitle("");
                                        setNewAssessmentWeight("");
                                        setAssessmentError("");
                                      }}
                                      className="rounded-md border border-white/20 px-3 py-2 text-xs"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddingToGroup(group.root.id);
                                    setNewAssessmentTitle("");
                                    setNewAssessmentWeight("");
                                    setAssessmentError("");
                                  }}
                                  className="rounded-md border border-dashed border-white/20 px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white"
                                >
                                  + Add assessment
                                </button>
                              )}
                            </div>

                            <div className="mt-3 border-t border-white/15 pt-3 text-xs text-white/70">
                              <p>Total weighting: {group.total_weight}%</p>
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

                {viewMode === "what-if" && (
                  <section>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold">
                          What-If Simulator
                        </h2>
                        <p className="mt-1 text-sm text-white/60">
                          Experiment with different marks and see how your
                          weighted contributions change. These values are
                          temporary and will not update your saved marks.
                        </p>
                      </div>

                      <span className="rounded-full border border-white/20 px-3 py-1 text-xs">
                        Simulation only
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2">
                      {markGroups.map((group) => {
                        const resultGroup = hasSimulation
                          ? simulatedGroups.find(
                              (result) => result.root.id === group.root.id,
                            )
                          : null;

                        return (
                          <section
                            key={group.root.id}
                            className="min-w-0 bg-transparent p-1.5"
                          >
                            <h3 className="inline-flex rounded-full bg-[#48588B] px-4 py-1.5 text-sm font-semibold">
                              {group.root.title}
                            </h3>

                            <p className="mt-2 text-xs text-white/60">
                              {group.assessments.length} assessment
                              {group.assessments.length === 1 ? "" : "s"}
                            </p>

                            <div className="mt-2 space-y-1">
                              <div className="grid grid-cols-[minmax(0,1fr)_80px_80px] gap-1 px-1 text-[11px] font-semibold text-white/60">
                                <span>Assessment</span>
                                <span>Weight (%)</span>
                                <span>Mark (%)</span>
                              </div>

                              <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={(event) =>
                                  handleAssessmentDragEnd(group, event)
                                }
                              >
                                <SortableContext
                                  items={group.assessments.map(
                                    (assessment) => assessment.id,
                                  )}
                                  strategy={verticalListSortingStrategy}
                                >
                                  {group.assessments.map((assessment) => (
                                    <SortableAssessmentRow
                                      key={assessment.id}
                                      assessment={assessment}
                                    >
                                      <div className="grid min-h-[52px] min-w-0 grid-cols-[minmax(0,1fr)_80px_80px] items-center gap-2 px-2 py-2">
                                        <div className="flex min-w-0 items-center justify-between gap-1">
                                          <div className="min-w-0">
                                            <h4 className="break-words text-xs font-medium text-white">
                                              {assessment.title}
                                            </h4>
                                            <p className="mt-1 text-[10px] text-white/60">
                                              Weight:{" "}
                                              {assessment.weight_percent == null
                                                ? "Not set"
                                                : `${assessment.weight_percent}%`}
                                              {" · Saved: "}
                                              {assessment.mark_achieved == null
                                                ? "Unmarked"
                                                : `${assessment.mark_achieved}%`}
                                            </p>
                                          </div>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleDeleteAssessment(assessment)
                                            }
                                            aria-label={`Delete ${assessment.title}`}
                                            title="Delete assessment"
                                            className="shrink-0 rounded px-1.5 py-1 text-xs text-white/60 hover:bg-red-500/20 hover:text-red-300"
                                          >
                                            ×
                                          </button>
                                        </div>


                                        <input
                                          aria-label={`What-if weight for ${assessment.title}`}
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="any"
                                          value={
                                            whatIfWeights[assessment.id] ?? ""
                                          }
                                          onChange={(event) =>
                                            changeWhatIfWeight(
                                              assessment.id,
                                              event.target.value,
                                            )
                                          }
                                          placeholder="—"
                                          className="w-full min-w-0 rounded-md border border-white/15 bg-[#1D224C] px-1.5 py-1 text-xs text-white"
                                        />

                                        <input
                                          aria-label={`What-if mark for ${assessment.title}`}
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="any"
                                          value={
                                            whatIfMarks[assessment.id] ?? ""
                                          }
                                          onChange={(event) =>
                                            changeWhatIfMark(
                                              assessment.id,
                                              event.target.value,
                                            )
                                          }
                                          placeholder="—"
                                          className="w-full min-w-0 rounded-md border border-white/15 bg-[#1D224C] px-1.5 py-1 text-xs text-white"
                                        />
                                      </div>
                                    </SortableAssessmentRow>
                                  ))}
                                </SortableContext>
                              </DndContext>
                            </div>

                            <div className="mt-3">
                              {addingToGroup === group.root.id ? (
                                <form
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    handleCreateAssessment(group);
                                  }}
                                  className="space-y-2 rounded-lg border border-white/10 bg-[#252B56] p-3"
                                >
                                  <input
                                    autoFocus
                                    value={newAssessmentTitle}
                                    onChange={(event) =>
                                      setNewAssessmentTitle(event.target.value)
                                    }
                                    placeholder="Assessment name"
                                    aria-label="Assessment name"
                                    className="w-full rounded-md border border-white/15 bg-[#1D224C] px-3 py-2 text-sm text-white"
                                  />

                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="any"
                                    value={newAssessmentWeight}
                                    onChange={(event) =>
                                      setNewAssessmentWeight(event.target.value)
                                    }
                                    placeholder="Weight (%) — optional"
                                    aria-label="Assessment weight"
                                    className="w-full rounded-md border border-white/15 bg-[#1D224C] px-3 py-2 text-sm text-white"
                                  />

                                  {assessmentError && (
                                    <p
                                      role="alert"
                                      className="text-xs text-red-300"
                                    >
                                      {assessmentError}
                                    </p>
                                  )}

                                  <div className="flex gap-2">
                                    <button
                                      type="submit"
                                      disabled={createAssessment.isPending}
                                      className="rounded-md bg-[#5A689B] px-3 py-2 text-xs font-medium disabled:opacity-50"
                                    >
                                      {createAssessment.isPending
                                        ? "Adding..."
                                        : "Add assessment"}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAddingToGroup(null);
                                        setNewAssessmentTitle("");
                                        setNewAssessmentWeight("");
                                        setAssessmentError("");
                                      }}
                                      className="rounded-md border border-white/20 px-3 py-2 text-xs"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddingToGroup(group.root.id);
                                    setNewAssessmentTitle("");
                                    setNewAssessmentWeight("");
                                    setAssessmentError("");
                                  }}
                                  className="rounded-md border border-dashed border-white/20 px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white"
                                >
                                  + Add assessment
                                </button>
                              )}
                            </div>

                            {hasSimulation && resultGroup && (
                              <div className="mt-3 border-t border-white/15 pt-3 text-xs text-white/70">
                                <p>
                                  Projected grade:{" "}
                                  <strong>
                                    {getSimulatedGrade(resultGroup) == null
                                      ? "N/A"
                                      : `${getSimulatedGrade(resultGroup).toFixed(2)}%`}
                                  </strong>
                                </p>

                                <p className="mt-1">
                                  Contribution toward final grade:{" "}
                                  <strong>
                                    {Number(resultGroup.total_marks).toFixed(2)}
                                    {" percentage points"}
                                  </strong>
                                </p>

                                <p className="mt-1">
                                  Total weighting:{" "}
                                  {Number(resultGroup.total_weight).toFixed(2)}%
                                </p>

                                <p className="mt-1">
                                  Unmarked assessments:{" "}
                                  {resultGroup.unmarked_count}
                                </p>
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>

                    {simulationError && (
                      <p role="alert" className="mt-4 text-sm text-red-400">
                        {simulationError}
                      </p>
                    )}

                    {simulation.isError && !simulationError && (
                      <p role="alert" className="mt-4 text-sm text-red-400">
                        The simulation failed. Please try again.
                      </p>
                    )}

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={resetWhatIf}
                        disabled={simulation.isPending}
                        className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-50"
                      >
                        Reset to saved marks
                      </button>
                    </div>

                    <p className="mt-3 text-xs text-white/60">
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
  );
}
