import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Plus, X } from 'lucide-react'

import {
  createItem,
  createTag,
  listTags,
  updateItem,
} from '../../../api/planning'

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

export default function CreatePlanningItemPanel({
  onClose,
  parentId,
  parentItem = null,
  editingItem = null,
  onCreated,
  onUpdated,
}) {
  const queryClient = useQueryClient()

  const [itemType, setItemType] = useState(editingItem?.item_type ?? 'TASK')
  const [title, setTitle] = useState(editingItem?.title ?? '')
  const [description, setDescription] = useState(editingItem?.description ?? '')
  const [tagInput, setTagInput] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState(() => (editingItem?.tags ?? []).map((tag) => tag.id))
  const [startDate, setStartDate] = useState(editingItem?.start_date ?? '')
  const [dueDate, setDueDate] = useState(editingItem?.due_date ?? '')
  const [durationCategory, setDurationCategory] = useState(editingItem?.duration_category ?? '')
  const [weightPercent, setWeightPercent] = useState(editingItem?.assignment_detail?.weight_percent ?? '')
  const [submissionUrl, setSubmissionUrl] = useState(editingItem?.assignment_detail?.submission_url ?? '')

  const tagsQuery = useQuery({
    queryKey: ['planning-tags'],
    queryFn: listTags,
  })

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

  useEffect(() => {
    /*
     * EDIT MODE
     * Populate the form exclusively from the item being edited.
     */
    if (editingItem) {
      setItemType(editingItem.item_type ?? 'TASK')
      setTitle(editingItem.title ?? '')
      setDescription(editingItem.description ?? '')
      setSelectedTagIds(
        (editingItem.tags ?? []).map((tag) =>
          typeof tag === 'object' ? tag.id : tag
        )
      )
      setStartDate(editingItem.start_date ?? '')
      setDueDate(editingItem.due_date ?? '')
      setDurationCategory(editingItem.duration_category ?? '')
      setWeightPercent(
        editingItem.assignment_detail?.weight_percent ?? ''
      )
      setSubmissionUrl(
        editingItem.assignment_detail?.submission_url ?? ''
      )
      setTagInput('')
      return
    }

    /*
     * CREATE MODE
     * Always start from a fresh scaffold.
     *
     * A nested child initially inherits its parent's tags.
     * These are only initial values; the user can freely edit them.
     */
    setItemType('TASK')
    setTitle('')
    setDescription('')
    setTagInput('')
    setSelectedTagIds(
      (parentItem?.tags ?? []).map((tag) =>
        typeof tag === 'object' ? tag.id : tag
      )
    )
    setStartDate('')
    setDueDate('')
    setDurationCategory('')
    setWeightPercent('')
    setSubmissionUrl('')
  }, [editingItem, parentId, parentItem])

  const updateItemMutation = useMutation({
    mutationFn: ({ id, payload }) => updateItem(id, payload),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['planning', 'tree'],
      })

      await queryClient.invalidateQueries({
        queryKey: ['planning', 'priority'],
      })

      await queryClient.invalidateQueries({
        queryKey: ['planning', 'history'],
      })

      onUpdated?.()
    },
  })

  const createItemMutation = useMutation({
    mutationFn: createItem,

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['planning', 'tree'],
      })

      await queryClient.invalidateQueries({
        queryKey: ['planning', 'history'],
      })

      onCreated?.()
    },
  })

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
      createItemMutation.isPending ||
      updateItemMutation.isPending
    ) {
      return
    }

    const payload = {
      ...(editingItem ? {} : { parent: parentId }),
      item_type: itemType,
      title: trimmedTitle,
      description: description.trim(),
      tag_ids: selectedTagIds,
    }

    if (startDate) {
      payload.start_date = startDate
    }

    if (dueDate) {
      payload.due_date = dueDate
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
      updateItemMutation.mutate({
        id: editingItem.id,
        payload,
      })
    } else {
      createItemMutation.mutate(payload)
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

      <form onSubmit={handleSubmit}>
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
              <input
                type="text"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleCreateTag()
                  }
                }}
                placeholder="tags..."
                className={inputClass}
              />

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

                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`
                        flex items-center gap-1
                        rounded-[7px] border px-[7px] py-[3px]
                        text-[10px]
                        ${
                          selected
                            ? 'border-[#c3d19b] bg-[#c3d19b] text-[#171a36]'
                            : 'border-[#4a496b] bg-[#2c3369] text-white'
                        }
                      `}
                    >
                      {tag.name}

                      {selected && <X size={9} />}
                    </button>
                  )
                })}
              </div>
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
            <label
              key={label}
              className="flex items-center gap-2 text-[12px] text-white"
            >
              <span className="w-[35px] shrink-0">{label}</span>

              <div className="relative flex-1">
                <input
                  type="date"
                  value={value}
                  onChange={(event) => setter(event.target.value)}
                  className={`${inputClass} pr-8`}
                />

                <CalendarDays
                  size={14}
                  className="
                    pointer-events-none absolute right-2 top-1/2
                    -translate-y-1/2 text-[#a9a4cf]
                  "
                />
              </div>
            </label>
          ))}
        </div>

        {/* Manual estimate */}
        <div className="mt-[15px]">
          <p className="mb-[6px] text-[12px] text-white">
            Estimated:
          </p>

          <div className="flex gap-[5px]">
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
                onClick={() =>
                  setDurationCategory(
                    durationCategory === value ? '' : value,
                  )
                }
                className={`
                  flex-1 rounded-[8px]
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
        </div>

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

            <input
              type="url"
              value={submissionUrl}
              onChange={(event) =>
                setSubmissionUrl(event.target.value)
              }
              placeholder="submission link..."
              className={inputClass}
            />
          </div>
        )}

        {createItemMutation.isError && (
          <div className="mt-3 text-[11px] text-[#e87979]">
            <p>Could not create item.</p>
            <pre className="mt-1 whitespace-pre-wrap break-words">
              {JSON.stringify(
                createItemMutation.error?.response?.data ??
                  createItemMutation.error?.message,
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
            createItemMutation.isPending ||
            updateItemMutation.isPending
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
          {editingItem
            ? updateItemMutation.isPending
              ? 'SAVING...'
              : 'SAVE'
            : createItemMutation.isPending
              ? 'CREATING...'
              : 'CREATE'}
        </button>
      </form>
    </aside>
  )
}
