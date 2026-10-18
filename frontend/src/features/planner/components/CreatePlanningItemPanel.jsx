import ArcDateField from '../../../components/ArcDateField'
import { useEffect, useId, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X } from 'lucide-react'
import { userDateKey } from '../../../lib/calendarDates.js'
import { usePriorityOrder } from '../../../hooks/usePriorityOrder'

import {
  createTag,
  deleteTag,
  getDependencyGraph,
  listTags,
  updateTag,
} from '../../../api/planning'
import DependencyGraphModal from './DependencyGraphModal'

const inputClass = `
  w-full rounded-[10px]
  border border-[#2e286b]
  bg-[#383969]
  px-[10px] py-[7px]
  text-[13px] text-white
  outline-none
  placeholder:text-[#918bc7]
  focus:border-[#7c9cde]
`

function priorityMaximum(rows, isCreating) {
  const currentMaximum = rows.reduce((maximum, row) => (
    Number.isInteger(row.position) && row.position > maximum
      ? row.position
      : maximum
  ), 0)
  return Math.max(1, currentMaximum + (isCreating ? 1 : 0))
}

function clampPriorityPosition(value, maximum) {
  if (!/^\d+$/.test(String(value).trim())) return maximum
  return Math.min(Math.max(Number(value), 1), maximum)
}

export default function CreatePlanningItemPanel({
  onClose,
  parentId,
  parentItem = null,
  editingItem = null,
  onCreate,
  draft = null,
  createError = null,
  onSave,
  editDraft = null,
  editError = null,
}) {
  const queryClient = useQueryClient()
  const submitted = useRef(false)
  const createOwner = useRef(null)
  const tagClickTimer = useRef(null)
  const priorityTouched = useRef(false)

  useEffect(() => {
    return () => clearTimeout(tagClickTimer.current)
  }, [])
  const [createSubmitted, setCreateSubmitted] = useState(false)
  const [dependencyGraphOpen, setDependencyGraphOpen] = useState(false)

  const [itemType, setItemType] = useState(editingItem?.item_type ?? 'TASK')
  const [title, setTitle] = useState(editingItem?.title ?? '')
  const [description, setDescription] = useState(editingItem?.description ?? '')
  const [tagInput, setTagInput] = useState('')
  const [editingTagId, setEditingTagId] = useState(null)
  const [editingTagName, setEditingTagName] = useState('')
  const [deletingTag, setDeletingTag] = useState(null)
  const [tagManagementError, setTagManagementError] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState(() => (editingItem?.tags ?? []).map((tag) => tag.id))
  const [startDate, setStartDate] = useState((editingItem ? editingItem.start_date : parentItem?.start_date) ?? '')
  const [dueDate, setDueDate] = useState((editingItem ? editingItem.due_date : parentItem?.due_date) ?? '')
  const [priorityPosition, setPriorityPosition] = useState(editingItem?.priority_position?.toString() ?? '')
  const [durationCategory, setDurationCategory] = useState(editingItem?.duration_category ?? '')
  const [weightPercent, setWeightPercent] = useState(editingItem?.assignment_detail?.weight_percent ?? '')
  const [submissionUrl, setSubmissionUrl] = useState(editingItem?.assignment_detail?.submission_url ?? '')
  const estimateFeedbackId = useId()
  const missingOriginalEstimate = !editingItem && !durationCategory
  const dueDateErrorId = useId()
  const assignmentWeightInvalid =
    itemType === 'ASSIGNMENT' &&
    weightPercent !== '' &&
    (
      !Number.isFinite(Number(weightPercent)) ||
      Number(weightPercent) < 0 ||
      Number(weightPercent) > 100 ||
      !/^\d+(?:\.\d{1,2})?$/.test(String(weightPercent))
    )

  const assignmentUrlInvalid = (() => {
    if (itemType !== 'ASSIGNMENT' || !submissionUrl.trim()) return false

    try {
      const url = new URL(submissionUrl.trim())
      return !['https:', 'http:'].includes(url.protocol)
    } catch {
      return true
    }
  })()

  const today = userDateKey()
  const invalidPastDueDate = Boolean(dueDate && dueDate < today && dueDate !== editingItem?.due_date)

  const tagsQuery = useQuery({
    queryKey: ['planning-tags'],
    queryFn: listTags,
  })
  const priorityQuery = usePriorityOrder()
  const dependencyGraphQuery = useQuery({
    queryKey: ['planning', 'dependency-graph', editingItem?.id],
    queryFn: () => getDependencyGraph(editingItem.id),
    enabled: Boolean(editingItem?.id),
  })
  const priorityRows = Array.isArray(priorityQuery.data) ? priorityQuery.data : []
  const maximumPriorityPosition = priorityMaximum(priorityRows, !editingItem)

  const tags = Array.isArray(tagsQuery.data)
    ? tagsQuery.data
    : tagsQuery.data?.results ?? []

  const createTagMutation = useMutation({
    mutationFn: (name) => createTag({ name }),

    onSuccess: async (tag) => {
      setSelectedTagIds((current) =>
        current.includes(tag.id)
          ? current
          : [...current, tag.id],
      )

      setTagInput('')

      await queryClient.invalidateQueries({
        queryKey: ['planning-tags'],
      })
    },
  })

  const updateTagMutation = useMutation({
    mutationFn: ({ id, name }) => updateTag(id, { name }),
    onSuccess: async () => {
      setEditingTagId(null)
      setEditingTagName('')
      setTagManagementError('')
      await queryClient.invalidateQueries({ queryKey: ['planning-tags'] })
      await queryClient.invalidateQueries({ queryKey: ['planning'] })
    },
    onError: () => {
      setTagManagementError('Could not rename tag. Please try again.')
    },
  })

  const deleteTagMutation = useMutation({
    mutationFn: (id) => deleteTag(id),
    onSuccess: async (_, deletedId) => {
      setSelectedTagIds((current) => current.filter((id) => id !== deletedId))
      setDeletingTag(null)
      setTagManagementError('')
      await queryClient.invalidateQueries({ queryKey: ['planning-tags'] })
      await queryClient.invalidateQueries({ queryKey: ['planning'] })
    },
    onError: () => {
      setTagManagementError('Could not delete tag. Please try again.')
    },
  })

  function beginRenameTag(tag) {
    setTagManagementError('')
    setEditingTagId(tag.id)
    setEditingTagName(tag.name)
  }

  function saveRenamedTag(tag) {
    const name = editingTagName.trim()

    if (!name || updateTagMutation.isPending) return

    if (name === tag.name) {
      setEditingTagId(null)
      return
    }

    const duplicate = tags.some(
      (candidate) =>
        candidate.id !== tag.id &&
        candidate.name.toLowerCase() === name.toLowerCase(),
    )

    if (duplicate) {
      setTagManagementError('A tag with that name already exists.')
      return
    }

    setTagManagementError('')
    updateTagMutation.mutate({ id: tag.id, name })
  }

  useEffect(() => {
    /*
     * EDIT MODE
     * Restore the submitted draft, or populate from the item being edited.
     */
    if (editingItem) {
      createOwner.current = null
      const source = editDraft ?? editingItem
      priorityTouched.current = Boolean(editDraft?.priorityChanged)
      setItemType(editDraft ? source.itemType : source.item_type ?? 'TASK')
      setTitle(source.title ?? '')
      setDescription(source.description ?? '')
      setSelectedTagIds(editDraft ? source.selectedTagIds : (source.tags ?? []).map((tag) =>
        typeof tag === 'object' ? tag.id : tag
      ))
      setStartDate(editDraft ? source.startDate : source.start_date ?? '')
      setDueDate(editDraft ? source.dueDate : source.due_date ?? '')
      setPriorityPosition(
        editDraft
          ? source.priorityPosition ?? source.priority_position?.toString() ?? String(maximumPriorityPosition)
          : source.priority_position?.toString() ?? String(maximumPriorityPosition),
      )
      setDurationCategory(editDraft ? source.durationCategory : source.duration_category ?? '')
      setWeightPercent(editDraft ? source.weightPercent : source.assignment_detail?.weight_percent ?? '')
      setSubmissionUrl(editDraft ? source.submissionUrl : source.assignment_detail?.submission_url ?? '')
      setTagInput(editDraft ? source.tagInput : '')
      return
    }

    /*
     * CREATE MODE
     * Restore a failed submission, or start from a fresh scaffold.
     *
     * A nested child initially inherits its parent's tags.
     * These are only initial values; the user can freely edit them.
     */
    // Refetching the parent must not reset a draft the user is typing.
    if (createOwner.current?.parentId === parentId && createOwner.current?.draft === draft) return
    createOwner.current = { parentId, draft }
    submitted.current = false
    setCreateSubmitted(false)
    setItemType(draft?.itemType ?? 'TASK')
    setTitle(draft?.title ?? '')
    setDescription(draft?.description ?? '')
    setTagInput(draft?.tagInput ?? '')
    setSelectedTagIds(
      draft?.selectedTagIds ?? (parentItem?.tags ?? []).map((tag) =>
        typeof tag === 'object' ? tag.id : tag
      )
    )
    setStartDate(draft?.startDate ?? parentItem?.start_date ?? '')
    setDueDate(draft?.dueDate ?? parentItem?.due_date ?? '')
    priorityTouched.current = Boolean(draft?.priorityChanged)
    setPriorityPosition(draft?.priorityPosition ?? String(maximumPriorityPosition))
    setDurationCategory(draft?.durationCategory ?? '')
    setWeightPercent(draft?.weightPercent ?? '')
    setSubmissionUrl(draft?.submissionUrl ?? '')
  }, [editingItem, editDraft, parentId, parentItem, draft, maximumPriorityPosition])

  useEffect(() => {
    if (!editingItem && !draft?.priorityPosition && !priorityTouched.current) {
      setPriorityPosition(String(maximumPriorityPosition))
    }
  }, [draft?.priorityPosition, editingItem, maximumPriorityPosition])

  function toggleTag(tagId) {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId],
    )
  }

  function handleCreateTag() {
    const name = tagInput.trim()

    if (!name || createTagMutation.isPending) {
      return
    }

    const existingTag = tags.find(
      (tag) => tag.name.toLowerCase() === name.toLowerCase(),
    )

    if (existingTag) {
      setSelectedTagIds((current) =>
        current.includes(existingTag.id)
          ? current
          : [...current, existingTag.id],
      )

      setTagInput('')
      return
    }

    createTagMutation.mutate(name)
  }

  function handleSubmit(event) {
    event.preventDefault()

    const trimmedTitle = title.trim()

    if (
      !trimmedTitle ||
      missingOriginalEstimate ||
      invalidPastDueDate ||
      assignmentWeightInvalid ||
      assignmentUrlInvalid ||
      (!editingItem && submitted.current)
    ) {
      return
    }

    if (startDate && dueDate && startDate > dueDate) {
      return
    }

    const normalisedPriorityPosition = clampPriorityPosition(
      priorityPosition,
      maximumPriorityPosition,
    )
    setPriorityPosition(String(normalisedPriorityPosition))

    const currentPriorityPosition = editingItem?.priority_position
    const priorityChanged = priorityTouched.current && (
      editingItem
        ? Number.isInteger(currentPriorityPosition) &&
          normalisedPriorityPosition !== currentPriorityPosition
        : normalisedPriorityPosition !== maximumPriorityPosition
    )

    const payload = {
      ...(editingItem ? {} : { parent: parentId }),
      item_type: itemType,
      title: trimmedTitle,
      description: description.trim(),
      tag_ids: selectedTagIds,
    }

    payload.start_date = startDate || null
    // Omit an untouched inherited deadline so Django can preserve its
    // explicit/inherited provenance instead of treating it as an override.
    const isUntouchedInheritedDueDate = (
      (!editingItem && parentItem && dueDate === (parentItem.due_date ?? '')) ||
      (editingItem?.due_date_inherited && dueDate === (editingItem.due_date ?? ''))
    )
    if (!isUntouchedInheritedDueDate) {
      payload.due_date = dueDate || null
    }

    if (durationCategory) {
      payload.duration_category = durationCategory
    }

    if (itemType === 'ASSIGNMENT') {
      const assignmentDetail = {}

      if (weightPercent !== '') {
        assignmentDetail.weight_percent = Number(weightPercent)
      }

      if (submissionUrl.trim()) {
        assignmentDetail.submission_url = submissionUrl.trim()
      }

      if (Object.keys(assignmentDetail).length > 0) {
        payload.assignment_detail = assignmentDetail
      }
    }

    if (editingItem) {
      if (submitted.current) return

      submitted.current = true

      const form = Object.freeze({
        itemType,
        title,
        description,
        tagInput,
        selectedTagIds: Object.freeze([...selectedTagIds]),
        startDate,
        dueDate,
        priorityPosition,
        priorityChanged,
        durationCategory,
        weightPercent,
        submissionUrl,
      })

      onSave?.({
        id: editingItem.id,
        payload: Object.freeze({
          ...payload,
          tag_ids: Object.freeze([...selectedTagIds]),
          ...(payload.assignment_detail
            ? {
                assignment_detail: Object.freeze({
                  ...payload.assignment_detail,
                }),
              }
            : {}),
        }),
        form,
        priorityPosition: priorityChanged ? normalisedPriorityPosition : null,
        tags: tags
          .filter((tag) => selectedTagIds.includes(tag.id))
          .map((tag) => ({ ...tag })),
      })
    } else {
      submitted.current = true
      setCreateSubmitted(true)
      const form = Object.freeze({
        itemType, title, description, tagInput,
        selectedTagIds: Object.freeze([...selectedTagIds]),
        startDate, dueDate, priorityPosition, priorityChanged, durationCategory, weightPercent, submissionUrl,
      })
      onCreate?.({
        payload: Object.freeze({ ...payload, tag_ids: Object.freeze([...selectedTagIds]),
          ...(payload.assignment_detail ? { assignment_detail: Object.freeze({ ...payload.assignment_detail }) } : {}),
        }),
        form,
        priorityPosition: priorityChanged ? normalisedPriorityPosition : null,
        tags: tags.filter((tag) => selectedTagIds.includes(tag.id)).map((tag) => ({ ...tag })),
      })
    }
  }

  return (
    <aside
      className="
        relative w-[287px]
        rounded-bl-[10px] rounded-tl-[10px]
        border border-[#27326c]
        bg-[#171a36]
        px-[34px] py-[32px]
      "
    >
      <button
        type="button"
        aria-label="Close task panel"
        title="Close"
        onClick={onClose}
        className="
          absolute left-[10px] top-[10px]
          flex h-[26px] w-[26px]
          items-center justify-center
          rounded-[7px]
          text-white/50
          transition-colors
          hover:bg-white/10 hover:text-white
        "
      >
        <X size={16} strokeWidth={1.9} />
      </button>

      <form noValidate onSubmit={handleSubmit}>
        <div
          className="
            flex h-[26px] w-full overflow-hidden
            rounded-[28px] border border-[#4a496b]
            bg-[#2c3369] text-[13px] text-white
          "
        >
          <button
            type="button"
            onClick={() => setItemType('TASK')}
            className={`
              flex flex-1 items-center justify-center rounded-[28px]
              ${itemType === 'TASK' ? 'bg-[#4d569c]' : ''}
            `}
          >
            Task
          </button>

          <button
            type="button"
            onClick={() => setItemType('ASSIGNMENT')}
            className={`
              flex flex-1 items-center justify-center rounded-[28px]
              ${itemType === 'ASSIGNMENT' ? 'bg-[#4d569c]' : ''}
            `}
          >
            Assignment
          </button>
        </div>

        <div className="mt-[15px] space-y-[9px]">
          <input
            autoFocus
            required
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="title..."
            className={inputClass}
          />

          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="description..."
            rows={2}
            className={`${inputClass} resize-none`}
          />

          {/* Tags */}
          <div>
            <div className="flex gap-[5px]">
              <div
                className="
                  flex min-h-[35px] min-w-0 flex-1 flex-wrap items-center
                  gap-[5px] rounded-[10px] border border-[#2e286b]
                  bg-[#383969] px-[7px] py-[5px]
                  focus-within:border-[#7c9cde]
                "
              >
                {tags
                  .filter((tag) => selectedTagIds.includes(tag.id))
                  .map((tag) => (
                    <span
                      key={tag.id}
                      className="
                        inline-flex max-w-full items-center gap-[4px]
                        rounded-[6px] bg-[#c3d19b] px-[6px] py-[3px]
                        text-[11px] text-[#171a36]
                      "
                    >
                      <span className="min-w-0 truncate">{tag.name}</span>
                      <button
                        type="button"
                        aria-label={`Unselect tag ${tag.name}`}
                        title={`Unselect ${tag.name}`}
                        onClick={() => {
                          clearTimeout(tagClickTimer.current)
                          setSelectedTagIds((current) =>
                            current.filter((id) => id !== tag.id),
                          )
                        }}
                        className="
                          flex shrink-0 items-center justify-center
                          rounded-[3px] hover:bg-black/10
                        "
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}

                <input
                  type="text"
                  aria-label="Tags"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleCreateTag()
                    }
                  }}
                  placeholder="tags..."
                  className="
                    min-w-[75px] flex-1 bg-transparent px-[3px]
                    text-[13px] text-white outline-none
                    placeholder:text-[#918bc7]
                  "
                />
              </div>

              <button
                type="button"
                aria-label="Add tag"
                onClick={handleCreateTag}
                disabled={!tagInput.trim() || createTagMutation.isPending}
                className="
                  flex w-[30px] shrink-0 items-center justify-center
                  rounded-[8px] bg-[#c3d19b]
                  text-[#171a36]
                  disabled:opacity-40
                "
              >
                <Plus size={14} />
              </button>
            </div>

            {tags.length > 0 && (
              <div className="mt-[7px] flex flex-wrap gap-[5px]">
                {tags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id)
                  const renaming = editingTagId === tag.id

                  return (
                    <div
                      key={tag.id}
                      className={`
                        flex items-center gap-1 rounded-[7px] border
                        px-[5px] py-[3px] text-[10px]
                        ${
                          selected
                            ? 'border-[#c3d19b] bg-[#c3d19b] text-[#171a36]'
                            : 'border-[#4a496b] bg-[#2c3369] text-white'
                        }
                      `}
                    >
                      {renaming ? (
                        <>
                          <input
                            aria-label={`Rename ${tag.name}`}
                            value={editingTagName}
                            onChange={(event) => setEditingTagName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                saveRenamedTag(tag)
                              }
                              if (event.key === 'Escape') {
                                setEditingTagId(null)
                                setTagManagementError('')
                              }
                            }}
                            className="w-[90px] rounded bg-[#383969] px-1 text-white"
                          />
                          <button
                            type="button"
                            aria-label={`Save rename ${tag.name}`}
                            disabled={!editingTagName.trim() || updateTagMutation.isPending}
                            onClick={() => saveRenamedTag(tag)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            aria-label={`Cancel rename ${tag.name}`}
                            onClick={() => {
                              setEditingTagId(null)
                              setTagManagementError('')
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-label={`Select tag ${tag.name}`}
                            aria-pressed={selected}
                            onClick={(event) => {
                              if (event.detail > 1) return

                              clearTimeout(tagClickTimer.current)
                              tagClickTimer.current = setTimeout(() => {
                                toggleTag(tag.id)
                              }, 220)
                            }}
                            onDoubleClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              clearTimeout(tagClickTimer.current)
                              beginRenameTag(tag)
                            }}
                            title="Double-click to rename"
                            className="flex items-center gap-1"
                          >
                            {tag.name}
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete tag ${tag.name}`}
                            title={`Delete ${tag.name}`}
                            onClick={() => {
                              setTagManagementError('')
                              setDeletingTag(tag)
                            }}
                            className="rounded p-[2px] hover:bg-red-400/30"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {deletingTag && (
              <div
                role="alertdialog"
                aria-label={`Delete tag ${deletingTag.name}`}
                aria-describedby="tag-delete-explanation"
                className="mt-2 rounded-[9px] border border-[#a45b6a] bg-[#29264c] p-3 text-white"
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && !deleteTagMutation.isPending) {
                    event.stopPropagation()
                    setDeletingTag(null)
                    setTagManagementError('')
                  }
                }}
              >
                <p className="text-[12px] font-semibold">
                  Delete “{deletingTag.name}”?
                </p>
                <p id="tag-delete-explanation" className="mt-1 text-[11px]">
                  This permanently deletes the tag from all tasks that use it.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={deleteTagMutation.isPending}
                    onClick={() => {
                      setDeletingTag(null)
                      setTagManagementError('')
                    }}
                    className="rounded bg-[#383969] px-3 py-1 text-[11px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleteTagMutation.isPending}
                    onClick={() => deleteTagMutation.mutate(deletingTag.id)}
                    className="rounded bg-[#a33f55] px-3 py-1 text-[11px]"
                  >
                    {deleteTagMutation.isPending ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            )}

            {tagManagementError && (
              <p role="alert" className="mt-1 text-[10px] text-[#e87979]">
                {tagManagementError}
              </p>
            )}

            {createTagMutation.isError && (
              <p className="mt-1 text-[10px] text-[#e87979]">
                Could not create tag.
              </p>
            )}
          </div>
        </div>

        {/* Dates */}
        <div className="mt-[15px] space-y-[8px]">
          {[
            ['Start:', startDate, setStartDate],
            ['Due:', dueDate, setDueDate],
          ].map(([label, value, setter]) => (
            <div
              key={label}
              className="flex items-center gap-2 text-[12px] text-white"
            >
              <span className="w-[35px] shrink-0">{label}</span>

              <div className="relative flex-1">
                <ArcDateField
                  type="date"
                  aria-label={label}
                  value={value}
                  aria-invalid={label === 'Due:' && invalidPastDueDate ? true : undefined}
                  aria-describedby={label === 'Due:' && invalidPastDueDate ? dueDateErrorId : undefined}
                  onChange={(event) => setter(event.target.value)}
                  className={`${inputClass} pr-8`}
                />
              </div>
            </div>
          ))}
          {invalidPastDueDate && (
            <p id={dueDateErrorId} role="alert" className="text-[11px] text-[#e87979]">
              Due date cannot be earlier than today.
            </p>
          )}
        </div>

        {/* Manual estimate */}
        <div className="mt-[15px]">
          <label className="flex items-center gap-2 text-[12px] text-white">
            <span className="shrink-0">Priority:</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max={maximumPriorityPosition}
              step="1"
              aria-label="Priority position"
              value={priorityPosition}
              onChange={(event) => {
                priorityTouched.current = true
                setPriorityPosition(event.target.value)
              }}
              onBlur={() => setPriorityPosition(String(clampPriorityPosition(priorityPosition, maximumPriorityPosition)))}
              className={`${inputClass} w-[72px] py-[5px]`}
            />
          </label>
        </div>

        <div className="mt-[15px]">
          <p className="mb-[6px] text-[12px] text-white">
            Original estimate:
          </p>

          <div role="group" aria-label="Original estimate" aria-describedby={missingOriginalEstimate ? estimateFeedbackId : undefined} className="grid grid-cols-3 gap-[5px] min-w-0">
            {[
              ['UNDER_20_MINUTES', '<20m'],
              ['UNDER_1_HOUR', '<1h'],
              ['UNDER_4_HOURS', '<4h'],
              ['UNDER_8_HOURS', '<8h'],
              ['UNDER_16_HOURS', '<16h'],
              ['OVER_16_HOURS', '>16h'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={durationCategory === value}
                onClick={() => {
                  setDurationCategory(
                    durationCategory === value ? '' : value,
                  )
                }}
                className={`
                  min-w-0 rounded-[8px]
                  border border-[#2e286b]
                  px-1 py-[5px]
                  text-[11px] text-white
                  ${
                    durationCategory === value
                      ? 'bg-[#4d569c]'
                      : 'bg-[#383969]'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
          {missingOriginalEstimate && (
            <p id={estimateFeedbackId} role="status" className="mt-2 text-[11px] text-[#e87979]">
              Choose an original estimate.
            </p>
          )}
        </div>

        {editingItem && ['UNDER_8_HOURS', 'UNDER_16_HOURS', 'OVER_16_HOURS'].includes(durationCategory) && (
          <p className="mt-2 text-[11px] text-white/50" role="status">
            Progress {Number(editingItem.percent_completed ?? 0)}%
            {editingItem.remaining_fraction != null && <> · Remaining {Math.round(Number(editingItem.remaining_fraction) * 100)}%</>}
          </p>
        )}

        {editingItem && dependencyGraphQuery.data?.edges?.length > 0 && (
          <button
            type="button"
            onClick={() => setDependencyGraphOpen(true)}
            className="mt-3 w-full rounded-[8px] border border-[#7c9cde] bg-[#2c3369] px-3 py-2 text-[12px] font-medium text-[#c3d19b] hover:bg-[#383969]"
          >
            Dependencies
          </button>
        )}

        {/* Assignment-only */}
        {itemType === 'ASSIGNMENT' && (
          <div className="mt-[15px] space-y-[9px]">
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-[12px] text-white">
                Weightage:
              </span>

              <div className="relative flex-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  aria-invalid={assignmentWeightInvalid}
                  value={weightPercent}
                  onChange={(event) =>
                    setWeightPercent(event.target.value)
                  }
                  className={`${inputClass} pr-7`}
                />

                <span
                  className="
                    pointer-events-none absolute right-2 top-1/2
                    -translate-y-1/2 text-[12px] text-[#a9a4cf]
                  "
                >
                  %
                </span>
              </div>
            </label>

            {assignmentWeightInvalid && (
              <p role="alert" className="text-[11px] text-[#e87979]">
                Weightage must be between 0 and 100, with at most two decimal places.
              </p>
            )}

            <input
              type="url"
              aria-invalid={assignmentUrlInvalid}
              value={submissionUrl}
              onChange={(event) =>
                setSubmissionUrl(event.target.value)
              }
              placeholder="submission link..."
              className={inputClass}
            />
            {assignmentUrlInvalid && (
              <p role="alert" className="text-[11px] text-[#e87979]">
                Enter a valid http:// or https:// submission link.
              </p>
            )}
          </div>
        )}

        {startDate && dueDate && startDate > dueDate && (
          <p role="alert" className="mt-3 text-[11px] text-[#e87979]">
            Due date cannot be earlier than start date.
          </p>
        )}

        {editError && (
          <div
            role="alert"
            className="mt-3 text-[11px] text-[#e87979]"
          >
            <p>Could not save changes.</p>

            <pre className="mt-1 whitespace-pre-wrap break-words">
              {JSON.stringify(
                editError?.response?.data ??
                  editError?.message ??
                  'Could not update item.',
                null,
                2,
              )}
            </pre>
          </div>
        )}

        {createError && (
          <div role="alert" className="mt-3 text-[11px] text-[#e87979]">
            <p>Could not create item.</p>
            <pre className="mt-1 whitespace-pre-wrap break-words">
              {JSON.stringify(
                createError?.response?.data ??
                  createError?.message,
                null,
                2,
              )}
            </pre>
          </div>
        )}

        <button
          type="submit"
          disabled={
            !title.trim() ||
            missingOriginalEstimate ||
            invalidPastDueDate ||
            assignmentWeightInvalid ||
            assignmentUrlInvalid ||
            Boolean(startDate && dueDate && startDate > dueDate) ||
            (!editingItem && createSubmitted)
          }
          className="
            mx-auto mt-[20px] block
            h-[32px] w-[151px]
            rounded-[10px]
            bg-[#c3d19b]
            text-[13px] font-semibold text-[#171a36]
            transition-[filter,opacity]
            hover:brightness-105
            disabled:cursor-not-allowed disabled:opacity-50
          "
        >
          {editingItem ? 'SAVE' : 'CREATE'}
        </button>
      </form>
      {dependencyGraphOpen && (
        <DependencyGraphModal
          task={editingItem}
          onClose={() => setDependencyGraphOpen(false)}
        />
      )}
    </aside>
  )
}
