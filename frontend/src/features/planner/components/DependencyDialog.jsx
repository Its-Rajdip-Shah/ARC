import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, X } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'

import { addPrerequisite, listItems, listPrerequisites } from '../../../api/planning'

function rowsFrom(response) {
  return Array.isArray(response) ? response : response?.results ?? []
}

function hierarchyById(items, ancestors = [], result = new Map()) {
  for (const item of items ?? []) {
    result.set(item.id, ancestors)
    hierarchyById(item.children, [...ancestors, item.title], result)
  }
  return result
}

function errorMessage(error) {
  const data = error?.response?.data
  if (typeof data?.detail === 'string') return data.detail
  if (Array.isArray(data?.detail)) return data.detail.join(' ')
  if (data && typeof data === 'object') {
    const message = Object.values(data).flat().find((value) => typeof value === 'string')
    if (message) return message
  }
  return error?.message || 'Could not create this dependency.'
}

export default function DependencyDialog({ fixedTask, planningTree, onClose, onCreated }) {
  const [search, setSearch] = useState('')
  const [otherTask, setOtherTask] = useState(null)
  const [reversed, setReversed] = useState(false)
  const hierarchy = useMemo(() => hierarchyById(planningTree), [planningTree])
  const candidates = useQuery({
    queryKey: ['planning', 'dependency-picker', search],
    queryFn: () => listItems({ search }),
  })
  const predecessor = reversed ? otherTask : fixedTask
  const dependent = reversed ? fixedTask : otherTask
  const existing = useQuery({
    queryKey: ['planning', 'prerequisites', dependent?.id],
    queryFn: () => listPrerequisites(dependent.id),
    enabled: Boolean(dependent?.id),
  })
  const isDuplicate = Boolean(predecessor && (existing.data ?? []).some((item) => item.id === predecessor.id))
  const mutation = useMutation({
    mutationFn: () => addPrerequisite(dependent.id, predecessor.id),
    onSuccess: async () => onCreated(),
  })

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !mutation.isPending) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mutation.isPending, onClose])

  const normalizedSearch = search.trim().toLowerCase()
  const rows = rowsFrom(candidates.data).filter((item) => (
    item.id !== fixedTask.id
    && (!normalizedSearch || String(item.title ?? '').toLowerCase().includes(normalizedSearch))
  ))
  const pick = (item) => {
    if (item.id !== fixedTask.id) setOtherTask(item)
  }
  const slotLabel = (task, label) => task ? task.title : `Choose ${label}`

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="dependency-dialog-title" className="w-full max-w-xl rounded-2xl border border-[#383969] bg-[#151326] p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="dependency-dialog-title" className="text-lg font-semibold">Create dependency</h2>
            <p className="mt-1 text-sm text-white/65">The first task stays fixed. Select the other task, then confirm.</p>
          </div>
          <button type="button" aria-label="Close dependency dialog" disabled={mutation.isPending} onClick={onClose} className="text-white/70 hover:text-white"><X size={20} /></button>
        </div>

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3" aria-label="Dependency direction">
          <div className="rounded-lg border border-[#7c9cde]/50 bg-[#202754] p-3">
            <span className="block text-xs text-[#c3d19b]">Fixed task</span>
            <strong className="block truncate">{slotLabel(fixedTask, 'task')}</strong>
          </div>
          <button type="button" aria-label="Reverse dependency direction" onClick={() => setReversed((value) => !value)} className="rounded-full border border-[#7c9cde] p-2 text-[#c3d19b] hover:bg-white/10"><ArrowLeftRight size={18} /></button>
          <div className="rounded-lg border border-dashed border-[#7c9cde]/70 bg-[#202754] p-3">
            <span className="block text-xs text-[#c3d19b]">Other task</span>
            <strong className="block truncate">{slotLabel(otherTask, 'a task')}</strong>
          </div>
        </div>

        <p className="mt-3 text-sm text-white/80">
          {predecessor && dependent ? <><strong>{predecessor.title}</strong> is the predecessor; <strong>{dependent.title}</strong> depends on it.</> : 'Choose a second task to define the relationship.'}
        </p>

        <label className="mt-5 block text-sm" htmlFor="dependency-task-search">Search tasks by title</label>
        <input id="dependency-task-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1 w-full rounded-lg border border-[#383969] bg-[#202754] p-2 text-white outline-none focus:border-[#7c9cde]" placeholder="Search tasks" />
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[#383969]" aria-label="Task picker">
          {candidates.isLoading && <p role="status" className="p-3 text-sm text-white/65">Loading tasks…</p>}
          {candidates.isError && <p role="alert" className="p-3 text-sm text-red-300">Could not load tasks. <button type="button" onClick={() => candidates.refetch()} className="underline">Retry</button></p>}
          {!candidates.isLoading && !candidates.isError && rows.length === 0 && <p className="p-3 text-sm text-white/65">No matching tasks.</p>}
          {rows.map((item) => {
            const ancestors = hierarchy.get(item.id) ?? []
            return <button key={item.id} type="button" draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', String(item.id))} onClick={() => pick(item)} className="block w-full border-b border-white/10 px-3 py-2 text-left hover:bg-white/10 last:border-0">
              <span className="block">{item.title}</span>
              {ancestors.length > 0 && <span className="block text-xs text-white/55">{ancestors.join(' › ')}</span>}
            </button>
          })}
        </div>
        <div className="mt-2 rounded-lg border border-dashed border-[#7c9cde]/70 p-2 text-sm text-white/65" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
          event.preventDefault()
          const id = Number(event.dataTransfer.getData('text/plain'))
          const item = rows.find((candidate) => candidate.id === id)
          if (item) pick(item)
        }}>Drag a task here to select the other task.</div>

        {otherTask?.id === fixedTask.id && <p role="alert" className="mt-3 text-sm text-red-300">A task cannot depend on itself.</p>}
        {isDuplicate && <p role="alert" className="mt-3 text-sm text-red-300">This dependency already exists.</p>}
        {existing.isError && <p role="alert" className="mt-3 text-sm text-red-300">Could not check existing dependencies. Try again.</p>}
        {mutation.isError && <p role="alert" className="mt-3 text-sm text-red-300">{errorMessage(mutation.error)}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" disabled={mutation.isPending} onClick={onClose} className="rounded-lg px-3 py-2 text-sm hover:bg-white/10">Cancel</button>
          <button type="button" disabled={!predecessor || !dependent || isDuplicate || existing.isLoading || existing.isError || mutation.isPending} onClick={() => mutation.mutate()} className="rounded-lg bg-[#c3d19b] px-3 py-2 text-sm font-medium text-[#171a36] disabled:cursor-not-allowed disabled:opacity-50">{mutation.isPending ? 'Creating…' : 'Create dependency'}</button>
        </div>
      </section>
    </div>
  )
}
