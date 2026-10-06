import SearchToolbar from '../../../shared/search/SearchToolbar'

export default function PriorityToolbar({
  find,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  busy,
}) {
  return (
    <SearchToolbar
      find={find}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={onUndo}
      onRedo={onRedo}
      busy={busy}
      findLabel="Find in shown priority tasks"
      toolsLabel="Priority tools"
      placeholder="Find in shown tasks…"
      className="priority-toolbar"
    />
  )
}
