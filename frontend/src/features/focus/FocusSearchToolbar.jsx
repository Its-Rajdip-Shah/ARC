import SearchToolbar from '../../shared/search/SearchToolbar'

export default function FocusSearchToolbar({
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
      findLabel="Find across Focus"
      toolsLabel="Focus tools"
      placeholder="Find across Focus…"
      className="focus-toolbar"
      arrowKeyNavigation
    />
  )
}
