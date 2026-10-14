import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PlannerSidebar from './components/PlannerSidebar'
import FocusSchedulerMascot from '../focus/FocusSchedulerMascot'
import PlannerTree from './components/PlannerTree'
import PriorityPanel from './components/PriorityPanel'
import CreatePlanningItemPanel from './components/CreatePlanningItemPanel'
import StudyPlanModal from './components/StudyPlanModal'
import { usePlanningTree } from '../../hooks/usePlanningTree'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createItem,
  updateItem,
  getHistoryStatus,
  undoPlanningAction,
  redoPlanningAction,
} from '../../api/planning'
import {
  ListTree,
  Undo2,
  Redo2,
  SquareCheckBig,
  ListChecks,
} from 'lucide-react'

function findItemById(items, id) {
  for (const item of items ?? []) {
    if (item.id === id) {
      return item
    }

    const childMatch = findItemById(item.children ?? [], id)

    if (childMatch) {
      return childMatch
    }
  }

  return null
}

import { provisionalPlanningItem, protectPlanningCreation, protectPlanningEdit, whenOtherPlanningMutationsIdle } from '../../lib/planningOptimistic'

const TOOLBAR_STORAGE_KEY = 'arc.planner.toolbar'

function loadToolbarPreferences() {
  const defaults = {
    showAllDetails: false,
    showCheckboxes: true,
    showCompleted: true,
  }

  try {
    const stored = window.localStorage.getItem(
      TOOLBAR_STORAGE_KEY,
    )

    if (!stored) {
      return defaults
    }

    const parsed = JSON.parse(stored)

    return {
      showAllDetails:
        typeof parsed.showAllDetails === 'boolean'
          ? parsed.showAllDetails
          : defaults.showAllDetails,

      showCheckboxes:
        typeof parsed.showCheckboxes === 'boolean'
          ? parsed.showCheckboxes
          : defaults.showCheckboxes,

      showCompleted:
        typeof parsed.showCompleted === 'boolean'
          ? parsed.showCompleted
          : defaults.showCompleted,
    }
  } catch {
    return defaults
  }
}

export default function PlannerPage() {

  const pathname = useLocation().pathname
  const isPriority = pathname === '/priority'
  const navigate = useNavigate()
  const [pendingRootId, setPendingRootId] = useState(null)
  const queryClient = useQueryClient()
  const panelGeneration = useRef(0)
  const pendingCreates = useIsMutating({ mutationKey: ['planning', 'create'] })
  const pendingEdits = useIsMutating({ mutationKey: ['planning', 'edit'] })
  const pendingEditIds = useRef(new Set())
  const editLock = useRef(false)
  const [estimatePrompt, setEstimatePrompt] = useState(null)
  const [estimateChoice, setEstimateChoice] = useState('')
  const [estimateSaving, setEstimateSaving] = useState(false)
  const [estimateError, setEstimateError] = useState(null)
  const [saveStatuses, setSaveStatuses] = useState({})
  const saveStatusTimers = useRef(new Map())

  function clearSaveStatusTimer(key) {
    const timer = saveStatusTimers.current.get(key)
    if (timer != null) {
      window.clearTimeout(timer)
      saveStatusTimers.current.delete(key)
    }
  }

  function setSaveStatus(key, status) {
    clearSaveStatusTimer(key)
    setSaveStatuses((current) => ({ ...current, [key]: status }))
    if (status !== 'confirmed') return

    const timer = window.setTimeout(() => {
      setSaveStatuses((current) => {
        if (current[key] !== 'confirmed') return current
        const next = { ...current }
        delete next[key]
        return next
      })
      saveStatusTimers.current.delete(key)
    }, 1000)
    saveStatusTimers.current.set(key, timer)
  }

  function removeSaveStatus(key) {
    clearSaveStatusTimer(key)
    setSaveStatuses((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  useEffect(() => {
    return () => {
      for (const timer of saveStatusTimers.current.values()) {
        window.clearTimeout(timer)
      }
      saveStatusTimers.current.clear()
    }
  }, [])
  const { data: recoveryDrafts } = useQuery({
    queryKey: ['planning-create-drafts'], enabled: false, initialData: [], gcTime: Infinity,
    queryFn: () => queryClient.getQueryData(['planning-create-drafts']) ?? [],
  })
  function setRecoveryDrafts(update) {
    queryClient.setQueryData(['planning-create-drafts'], update)
  }
  const [activeDraft, setActiveDraft] = useState(null)
  const [failedEdit, setFailedEdit] = useState(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => { panelGeneration.current += 1 }, [pathname])
  const priorityReordering = useIsMutating({ mutationKey: ['planning', 'priority', 'reorder'] }) > 0

  const historyQuery = useQuery({
    queryKey: ['planning', 'history'],
    queryFn: getHistoryStatus,
    staleTime: Infinity,
  })

  const undoMutation = useMutation({
    mutationFn: undoPlanningAction,

    onSuccess: async (result) => {
      queryClient.setQueryData(
        ['planning', 'history'],
        {
          can_undo: result.can_undo,
          can_redo: result.can_redo,
        },
      )

      if (result.changed) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['planning', 'tree'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['planning', 'priority'],
          }),
        ])
      }
    },
  })

  const redoMutation = useMutation({
    mutationFn: redoPlanningAction,

    onSuccess: async (result) => {
      queryClient.setQueryData(
        ['planning', 'history'],
        {
          can_undo: result.can_undo,
          can_redo: result.can_redo,
        },
      )

      if (result.changed) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['planning', 'tree'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['planning', 'priority'],
          }),
        ])
      }
    },
  })

  /*
   * Priority reconciliation must not freeze ordinary Priority interaction.
   * It still disables undo/redo until its coalesced mutation chain settles,
   * because history must only operate on confirmed server state.
   */
  const historyBusy =
    undoMutation.isPending
    || redoMutation.isPending

  const historyUnsafe =
    historyBusy
    || priorityReordering
    || pendingCreates > 0
    || pendingEdits > 0

  const canUndo =
    Boolean(
      historyQuery.data
        ?.can_undo,
    )
    && !historyUnsafe

  const canRedo =
    Boolean(
      historyQuery.data
        ?.can_redo,
    )
    && !historyUnsafe


  const [studyPlanOpen, setStudyPlanOpen] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [toolbarPreferences] = useState(
    loadToolbarPreferences,
  )

  const [showAllDetails, setShowAllDetails] = useState(
    toolbarPreferences.showAllDetails,
  )

  const [showCheckboxes, setShowCheckboxes] = useState(
    toolbarPreferences.showCheckboxes,
  )

  const [showCompleted, setShowCompleted] = useState(
    toolbarPreferences.showCompleted,
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [showOverdue, setShowOverdue] = useState(false)

  function handleNavigateToRoot(rootId) {
    // A filtered view may currently hide the requested root.
    setSearchQuery('')
    setShowOverdue(false)
    setPendingRootId(rootId)
    if (isPriority) navigate('/planner')
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(
        TOOLBAR_STORAGE_KEY,
        JSON.stringify({
          showAllDetails,
          showCheckboxes,
          showCompleted,
        }),
      )
    } catch {
      // Ignore unavailable browser storage.
    }
  }, [
    showAllDetails,
    showCheckboxes,
    showCompleted,
  ])
  const [hoveredItemId, setHoveredItemId] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [panelMode, setPanelMode] = useState(null)
  const [createParentId, setCreateParentId] = useState(null)

  const { data: planningTree, isLoading, isError, refetch } = usePlanningTree()

  function handleSelectItem(itemId) {
    // Hover/current task is independent from panel ownership.
    setSelectedItemId(itemId)
  }

  function handleEditItem(item) {
    if (
      editLock.current ||
      item.is_provisional ||
      pendingEditIds.current.has(item.id)
    ) return
    panelGeneration.current += 1
    setActiveDraft(null)
    // Double-click the current edit owner again → cancel editing.
    if (
      panelMode === 'edit' &&
      editingItem?.id === item.id
    ) {
      closePanel()
      return
    }

    // Double-clicking another task replaces the current panel owner.
    setEditingItem(item)
    setCreateParentId(null)
    setPanelMode('edit')
  }

  function handleCreateNested(item) {
    if (item.is_provisional) return
    panelGeneration.current += 1
    setActiveDraft(null)
    // Cmd/Ctrl-click or + on the current add owner again → cancel.
    if (
      panelMode === 'create' &&
      createParentId === item.id
    ) {
      closePanel()
      return
    }

    // Adding beneath another task replaces the current panel owner.
    setEditingItem(null)
    setCreateParentId(item.id)
    setPanelMode('create')
  }

  function closePanel() {
    panelGeneration.current += 1
    setActiveDraft(null)
    setPanelMode(null)
    setEditingItem(null)
    setCreateParentId(null)
  }

  function recoverDraft(draft) {
    panelGeneration.current += 1
    setActiveDraft(draft)
    setEditingItem(null)
    setCreateParentId(draft.payload.parent)
    setPanelMode('create')
    setRecoveryDrafts((drafts) => drafts.filter((entry) => entry !== draft))
  }

  function recoverEdit(record) {
    if (
      editLock.current ||
      pendingEditIds.current.has(record.id)
    ) return
    const item = findItemById(
      queryClient.getQueryData(['planning', 'tree']) ?? [],
      record.id,
    )
    if (!item) return
    panelGeneration.current += 1
    setEditingItem(item)
    setCreateParentId(null)
    setActiveDraft(null)
    setFailedEdit(record)
    setPanelMode('edit')
  }

  const editMutation = useMutation({
    mutationKey: ['planning', 'edit'],
    mutationFn: ({ submission }) => updateItem(submission.id, submission.payload),
    onSuccess: async (serverFields, { submission, protection }) => {
      await queryClient.cancelQueries({ queryKey: ['planning', 'tree'] })
      protection.reconcile(serverFields)
      setSaveStatus(String(submission.id), 'confirmed')
      protection.release()
      // A successful retry owns only its own recovery record.
      if (mounted.current) setFailedEdit((record) => record?.id === submission.id ? null : record)
      try {
        await queryClient.invalidateQueries({ queryKey: ['planning'] })
        await queryClient.invalidateQueries({ queryKey: ['planning', 'history'] })
      } finally {
        pendingEditIds.current.delete(submission.id)
        editLock.current = false
      }
    },
    onError: (error, { submission, protection, previous, generation }) => {
      protection.rollback(previous)
      removeSaveStatus(String(submission.id))
      protection.release()
      pendingEditIds.current.delete(submission.id)
      editLock.current = false
      const record = { id: submission.id, form: submission.form, error }
      if (mounted.current) {
        setFailedEdit(record)
        if (panelGeneration.current === generation) recoverEdit(record)
      }
    },
  })

  const createMutation = useMutation({
    mutationKey: ['planning', 'create'],
    mutationFn: async ({ submission, generation, protection, provisionalId }) => {
      try {
        let serverItem
        try {
          serverItem = await createItem(submission.payload)
        } catch (error) {
          if (!protection.isActive()) {
            removeSaveStatus(String(provisionalId))
            return
          }
          removeSaveStatus(String(provisionalId))
          protection.remove()
          const failedDraft = { ...submission, error }
          if (mounted.current) {
            if (panelGeneration.current === generation) recoverDraft(failedDraft)
            else setRecoveryDrafts((drafts) => [...drafts, failedDraft])
          } else setRecoveryDrafts((drafts) => [...drafts, failedDraft])
          return
        }
        // Discard reads started before the POST completed, then replace only
        // this row. Confirmed rows immediately regain normal cache behavior.
        if (!protection.isActive()) {
          removeSaveStatus(String(provisionalId))
          return
        }
        await queryClient.cancelQueries({ queryKey: ['planning', 'tree'] })
        protection.reconcile(serverItem)
        removeSaveStatus(String(provisionalId))
        setSaveStatus(String(serverItem.id), 'confirmed')
        await whenOtherPlanningMutationsIdle(queryClient)
        if (!protection.isActive()) {
          removeSaveStatus(String(provisionalId))
          return
        }
        await queryClient.invalidateQueries({ queryKey: ['planning'] })
      } finally {
        protection.release()
      }
    },
  })

  function handleCreate(submission) {
    setSearchQuery('')
    setShowOverdue(false)
    closePanel()
    const generation = panelGeneration.current
    void queryClient.cancelQueries({ queryKey: ['planning', 'tree'] })
    const provisionalItem = provisionalPlanningItem(
      submission.payload,
      submission.tags,
    )
    const protection = protectPlanningCreation(
      queryClient,
      provisionalItem,
    )
    setSaveStatus(String(provisionalItem.id), 'pending')
    createMutation.mutate({
      submission,
      generation,
      protection,
      provisionalId: provisionalItem.id,
    })
  }

  function handleResidualEstimatePrompt(parent) {
    if (!parent?.id || !parent.duration_category) return

    setEstimatePrompt(parent)
    setEstimateChoice(parent.duration_category)
    setEstimateError(null)
  }

  async function confirmResidualEstimate() {
    if (!estimatePrompt || estimateSaving || editLock.current) return

    const parent = findItemById(
      queryClient.getQueryData(['planning', 'tree']) ?? [],
      estimatePrompt.id,
    )

    if (!parent) {
      setEstimateError('This task is no longer available. Please refresh.')
      return
    }

    if (estimateChoice === parent.duration_category) {
      setEstimatePrompt(null)
      setEstimateError(null)
      return
    }

    editLock.current = true
    pendingEditIds.current.add(parent.id)
    setEstimateSaving(true)
    setEstimateError(null)

    const previous = { duration_category: parent.duration_category }

    await queryClient.cancelQueries({ queryKey: ['planning', 'tree'] })

    const protection = protectPlanningEdit(
      queryClient,
      parent.id,
      { duration_category: estimateChoice },
    )

    setSaveStatus(String(parent.id), 'pending')

    try {
      const serverItem = await updateItem(parent.id, {
        duration_category: estimateChoice,
      })

      await queryClient.cancelQueries({ queryKey: ['planning', 'tree'] })
      protection.reconcile(serverItem)
      setSaveStatus(String(parent.id), 'confirmed')
      setEstimatePrompt(null)

      await queryClient.invalidateQueries({ queryKey: ['planning'] })
      await queryClient.invalidateQueries({ queryKey: ['planning', 'history'] })
    } catch (error) {
      protection.rollback(previous)
      removeSaveStatus(String(parent.id))
      setEstimateError(
        error?.response?.data?.detail ??
        error?.message ??
        'Could not save the estimate. Please try again.',
      )
    } finally {
      protection.release()
      pendingEditIds.current.delete(parent.id)
      editLock.current = false
      setEstimateSaving(false)
    }
  }

  function handleSave(submission) {
    if (
      editLock.current ||
      pendingEditIds.current.has(submission.id)
    ) return
    const item = findItemById(
      queryClient.getQueryData(['planning', 'tree']) ?? [], submission.id,
    )
    if (!item) {
      closePanel()
      setFailedEdit({ id: submission.id, form: submission.form,
        error: new Error('This item no longer exists. Your edits are preserved.') })
      return
    }
    const fields = {}
    const previous = {}
    for (const [key, value] of Object.entries(submission.payload)) {
      if (['id', 'parent', 'children', 'is_completed', 'is_provisional'].includes(key)) continue
      const field = key === 'tag_ids' ? 'tags' : key
      fields[field] = key === 'tag_ids' ? submission.tags : value
      previous[field] = item[field]
    }
    editLock.current = true
    pendingEditIds.current.add(submission.id)
    closePanel()
    const generation = panelGeneration.current
    void queryClient.cancelQueries({ queryKey: ['planning', 'tree'] })
    const protection = protectPlanningEdit(queryClient, submission.id, fields)
    setSaveStatus(String(submission.id), 'pending')
    editMutation.mutate({ submission, generation, protection, previous })
  }

  const panelOwnerId =
    panelMode === 'edit'
      ? editingItem?.id ?? null
      : panelMode === 'create'
        ? createParentId
        : null

  useEffect(() => {
    function handlePlannerShortcut(event) {
      const target = event.target

      // Never steal normal editing keys from form controls.
      const isEditing =
        target instanceof HTMLElement &&
        (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        )

      if (isEditing) {
        return
      }

      const modifier = event.metaKey || event.ctrlKey

      if (!modifier) {
        return
      }

      const key = event.key.toLowerCase()

      // Cmd/Ctrl + Z = Undo
      if (key === 'z' && !event.shiftKey) {
        if (canUndo) {
          event.preventDefault()
          undoMutation.mutate()
        }
        return
      }

      // Cmd/Ctrl + Y or Cmd/Ctrl + Shift + Z = Redo
      if (
        key === 'y' ||
        (key === 'z' && event.shiftKey)
      ) {
        if (canRedo) {
          event.preventDefault()
          redoMutation.mutate()
        }
      }
    }

    window.addEventListener('keydown', handlePlannerShortcut)

    return () => {
      window.removeEventListener('keydown', handlePlannerShortcut)
    }
  }, [canUndo, canRedo, undoMutation, redoMutation])

  // Wait for Planner and its tree to render before resolving sidebar navigation.
  useEffect(() => {
    if (isPriority || isLoading || isError || pendingRootId === null) return
    const frame = requestAnimationFrame(() => {
      const rootElement = document.querySelector(
        `[data-planner-item-id="${pendingRootId}"]`,
      )
      rootElement?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setPendingRootId(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [isPriority, isLoading, isError, pendingRootId, planningTree])

  const items = planningTree ?? []

  return (
    <div className="relative flex min-h-screen flex-col md:flex-row">
      {!isPriority && <PlannerSidebar
        scheduler={<FocusSchedulerMascot className="planner-scheduler-mascot" />}
        roots={items.filter((item) => !item.is_provisional)}
        showOverdue={showOverdue}
        onToggleOverdue={() => {
          setShowOverdue((current) => !current)
        }}
        onNavigateToRoot={handleNavigateToRoot}
      />}

      <main className={isPriority ? 'priority-page-content min-w-0 flex-1' : 'min-w-0 flex-1 px-16 pb-16 pt-0'}>
        {isPriority ? (
          <PriorityPanel
            canUndo={canUndo}
            canRedo={canRedo}
            historyBusy={historyBusy}
            onUndo={() => undoMutation.mutate()}
            onRedo={() => redoMutation.mutate()}
          />
        ) : (
        <div className="mx-auto w-full max-w-[620px]">
          {isLoading && <p role="status" className="pt-24 text-sm text-arc-text-secondary">Loading planner...</p>}
          {isError && !planningTree && (
            <div role="alert" className="mt-24 rounded-xl border border-arc-danger bg-arc-panel p-5 text-sm">
              <p>Could not load Planner. Your existing work has not been changed.</p>
              <button type="button" onClick={() => refetch()} className="mt-3 rounded-lg bg-arc-blue px-4 py-2 font-semibold">Retry</button>
            </div>
          )}
          {!isLoading && !isError && items.length === 0 && (
            <div role="status" className="mt-24 rounded-xl border border-[#4a496b] bg-arc-panel p-5 text-sm text-arc-text-secondary">
              Your planner is empty. Add a subject using the sidebar, or connect Canvas in Settings to import courses.
            </div>
          )}

          {!isLoading && (!isError || planningTree) && (
            <>
            <div className="
              sticky top-[80px] z-20 mb-2 flex h-[38px]
              items-center justify-between gap-1 px-3

              rounded-[10px]

              bg-[#202754]/85
              backdrop-blur-xl
              backdrop-saturate-150

              border
              border-r-white/5
              border-b-white/5
              border-t-[#8fa8e8]/35
              border-l-[#8fa8e8]/35

              shadow-[0_8px_24px_rgba(5,10,35,0.22)]
            ">
                            <div
                className="
                  flex min-w-0 flex-1 items-center
                  border-r border-white/10 pr-2
                "
              >
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(event.target.value)
                  }
                  placeholder="Search tasks..."
                  aria-label="Search tasks"
                  className="
                    h-[28px] w-full min-w-0
                    bg-transparent px-2
                    text-[12px] text-white/90
                    outline-none
                    placeholder:text-white/30
                  "
                />
              </div>

<button
                type="button"
                aria-label={showAllDetails ? 'Hide all task details' : 'Show all task details'}
                aria-pressed={showAllDetails}
                onClick={() => setShowAllDetails((value) => !value)}
                className={`
                  flex h-[28px] w-[30px] items-center justify-center
                  rounded-[6px] transition-colors
                  ${
                    showAllDetails
                      ? 'bg-[#7c9cde] text-[#171a36]'
                      : 'text-[#9db6e8] hover:bg-white/10 hover:text-white'
                  }
                `}
              >
                <ListTree size={18} strokeWidth={1.8} />
              </button>

              <button
                type="button"
                aria-label={
                  showCheckboxes
                    ? 'Hide task checkboxes'
                    : 'Show task checkboxes'
                }
                aria-pressed={showCheckboxes}
                onClick={() => setShowCheckboxes((value) => !value)}
                className={`
                  flex h-[28px] w-[30px]
                  items-center justify-center
                  rounded-[6px] transition-colors
                  ${
                    showCheckboxes
                      ? 'bg-[#7c9cde] text-[#171a36]'
                      : 'text-[#9db6e8] hover:bg-white/10 hover:text-white'
                  }
                `}
              >
                <SquareCheckBig size={18} strokeWidth={1.8} />
              </button>

              <button
                type="button"
                aria-label={
                  showCompleted
                    ? 'Hide completed tasks'
                    : 'Show completed tasks'
                }
                aria-pressed={showCompleted}
                title={
                  showCompleted
                    ? 'Hide completed tasks'
                    : 'Show completed tasks'
                }
                onClick={() =>
                  setShowCompleted((current) => !current)
                }
                className={`
                  flex h-[28px] w-[30px]
                  items-center justify-center
                  rounded-[6px] transition-colors
                  ${
                    showCompleted
                      ? 'bg-[#7c9cde] text-[#171a36]'
                      : 'text-[#9db6e8] hover:bg-white/10 hover:text-white'
                  }
                `}
              >
                <ListChecks size={18} strokeWidth={1.8} />
              </button>

              <button
                type="button"
                aria-label="Undo"
                onClick={() => undoMutation.mutate()}
                disabled={!canUndo}
                className={`
                  flex h-[28px] w-[30px] ${!canUndo ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-white/10'}
                  items-center justify-center rounded-[6px]
                  ${!canUndo ? 'text-white/25' : 'text-[#9db6e8] hover:text-white'}
                `}
              >
                <Undo2 size={18} strokeWidth={1.8} />
              </button>

              <button
                type="button"
                aria-label="Redo"
                onClick={() => redoMutation.mutate()}
                disabled={!canRedo}
                className={`
                  flex h-[28px] w-[30px] ${!canRedo ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-white/10'}
                  items-center justify-center rounded-[6px]
                  ${!canRedo ? 'text-white/25' : 'text-[#9db6e8] hover:text-white'}
                `}
              >
                <Redo2 size={18} strokeWidth={1.8} />
              </button>

              <button
                type="button"
                onClick={() => { panelGeneration.current += 1; setStudyPlanOpen(true) }}
                className="
                  h-[28px] shrink-0 rounded-[6px] px-2
                  text-[12px] text-[#9db6e8]
                  hover:bg-white/10 hover:text-white
                "
              >
                Study plan
              </button>
            </div>

            <button type="button" onClick={() => {
              panelGeneration.current += 1
              setActiveDraft(null)
              setEditingItem(null)
              setCreateParentId(null)
              setPanelMode('create')
            }} className="text-sm text-[#9db6e8]">Create task or assignment</button>
            {recoveryDrafts.map((draft, index) => (
              <div key={index} role="alert" className="mt-2 text-sm text-[#e87979]">
                Could not create “{draft.form.title}”. Your draft is saved.
                <button type="button" onClick={() => recoverDraft(draft)}>Recover draft: {draft.form.title}</button>
              </div>
            ))}
            {failedEdit && !(panelMode === 'edit' && editingItem?.id === failedEdit.id) && (
              <div role="alert" className="mt-2 text-sm text-[#e87979]">
                Could not save “{failedEdit.form.title}”. Your edits are preserved.
                <pre className="whitespace-pre-wrap break-words">{JSON.stringify(
                  failedEdit.error?.response?.data ?? failedEdit.error?.message,
                  null, 2,
                )}</pre>
                <button type="button" onClick={() => recoverEdit(failedEdit)}>Recover edits</button>
                <button type="button" onClick={() => setFailedEdit(null)}>Dismiss edit error</button>
              </div>
            )}
            <div className="mt-[80px]">
              <PlannerTree
                editLocked={pendingEdits > 0}
                saveStatuses={saveStatuses}
                items={items}
                selectedItemId={selectedItemId}
                panelOwnerId={panelOwnerId}
                onPanelOwnerDeleted={closePanel}
                hoveredItemId={hoveredItemId}
                showAllDetails={showAllDetails}
                showCheckboxes={showCheckboxes}
                showCompleted={showCompleted}
                searchQuery={searchQuery}
                showOverdue={showOverdue}
                onHoverItem={setHoveredItemId}
                onSelectItem={handleSelectItem}
                onEditItem={handleEditItem}
                onCreateNested={handleCreateNested}
                onResidualEstimatePrompt={handleResidualEstimatePrompt}
              />
            </div>
            </>
          )}
        </div>
        )}
      </main>

      {!isPriority && panelMode && (
        <div
          className="
            fixed right-0 top-1/2 z-40
            -translate-y-1/2
          "
        >
          <CreatePlanningItemPanel
            key={`${panelMode}:${createParentId}:${activeDraft ? 'recovery' : 'fresh'}${panelMode === 'edit' ? `:${editingItem?.id}` : ''}`}
            draft={panelMode === 'create' ? activeDraft?.form : null}
            createError={panelMode === 'create' ? activeDraft?.error : null}
            onClose={closePanel}
            parentId={panelMode === 'create' ? createParentId : null}
            parentItem={
              panelMode === 'create' && createParentId
                ? findItemById(items, createParentId)
                : null
            }
            editingItem={panelMode === 'edit' ? editingItem : null}
            onCreate={handleCreate}
            onSave={handleSave}
            editDraft={panelMode === 'edit' && failedEdit?.id === editingItem?.id ? failedEdit.form : null}
            editError={panelMode === 'edit' && failedEdit?.id === editingItem?.id ? failedEdit.error : null}
          />
        </div>
      )}

      {!isPriority && estimatePrompt && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="residual-estimate-title"
            className="w-full max-w-md rounded-2xl border border-[#383969] bg-[#151326] p-6 text-white shadow-2xl"
          >
            <h2
              id="residual-estimate-title"
              className="text-lg font-semibold"
            >
              How much work is left?
            </h2>

            <p className="mt-3 text-sm text-slate-300">
              All subtasks of <strong>{estimatePrompt.title}</strong> are complete.
              Confirm or update this task's estimated time.
            </p>

            <div
              role="group"
              aria-label="Estimated time"
              className="mt-5 grid grid-cols-3 gap-2"
            >
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
                  disabled={estimateSaving}
                  aria-pressed={estimateChoice === value}
                  onClick={() => setEstimateChoice(value)}
                  className={
                    'rounded-lg border px-3 py-2 text-sm ' +
                    (estimateChoice === value
                      ? 'border-blue-400 bg-blue-600 text-white'
                      : 'border-[#383969] bg-[#211d3c] text-slate-200')
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {estimateError && (
              <p role="alert" className="mt-3 text-sm text-red-400">
                {String(estimateError)}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={estimateSaving}
                onClick={() => {
                  setEstimatePrompt(null)
                  setEstimateError(null)
                }}
                className="rounded-lg px-4 py-2 text-sm text-slate-300"
              >
                Dismiss
              </button>

              <button
                type="button"
                disabled={estimateSaving || editLock.current}
                onClick={confirmResidualEstimate}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {estimateSaving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </section>
        </div>
      )}

      {!isPriority && studyPlanOpen && (
        <StudyPlanModal onClose={() => setStudyPlanOpen(false)} />
      )}
    </div>
  )
}
