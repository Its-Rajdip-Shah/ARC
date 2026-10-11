import { useEffect, useState } from 'react'
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

  const isPriority = useLocation().pathname === '/priority'
  const navigate = useNavigate()
  const [pendingRootId, setPendingRootId] = useState(null)
  const queryClient = useQueryClient()
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

  const { data: planningTree, isLoading, isError } = usePlanningTree()

  function handleSelectItem(itemId) {
    // Hover/current task is independent from panel ownership.
    setSelectedItemId(itemId)
  }

  function handleEditItem(item) {
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
    setPanelMode(null)
    setEditingItem(null)
    setCreateParentId(null)
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
        roots={items}
        showOverdue={showOverdue}
        onToggleOverdue={() => {
          setShowOverdue((current) => !current)
        }}
        onNavigateToRoot={handleNavigateToRoot}
      />}

      <main className={isPriority ? 'min-w-0 flex-1 pt-24 md:pt-14' : 'min-w-0 flex-1 px-16 pb-16 pt-0'}>
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
          {isLoading && <p>Loading planner...</p>}
          {isError && <p>Could not load planner.</p>}

          {!isLoading && !isError && (
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
                onClick={() => setStudyPlanOpen(true)}
                className="
                  h-[28px] shrink-0 rounded-[6px] px-2
                  text-[12px] text-[#9db6e8]
                  hover:bg-white/10 hover:text-white
                "
              >
                Study plan
              </button>
            </div>

            <div className="mt-[80px]">
              <PlannerTree
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
            onClose={closePanel}
            parentId={panelMode === 'create' ? createParentId : null}
            parentItem={
              panelMode === 'create' && createParentId
                ? findItemById(items, createParentId)
                : null
            }
            editingItem={panelMode === 'edit' ? editingItem : null}
            onCreated={closePanel}
            onUpdated={closePanel}
          />
        </div>
      )}

      {!isPriority && studyPlanOpen && (
        <StudyPlanModal onClose={() => setStudyPlanOpen(false)} />
      )}
    </div>
  )
}
