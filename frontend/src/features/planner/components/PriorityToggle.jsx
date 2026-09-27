export default function PriorityToggle({ isOpen, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-controls="priority-panel"
      aria-label={isOpen ? 'Close priority view' : 'Open priority view'}
      title={isOpen ? 'Close priority' : 'Open priority'}
      className={`
        fixed right-0 top-1/2 z-40 rounded-l-arc-control
        flex h-[34px] w-[50px] -translate-y-1/2
        items-center justify-center
        bg-arc-accent text-arc-bg
        shadow-md
        transition-colors duration-150
        focus-visible:outline-2 focus-visible:outline-offset-2
        focus-visible:outline-white

      `}
    >
      <span className="text-[25px] leading-none" aria-hidden="true">
        {isOpen ? '›' : '‹'}
      </span>
    </button>
  )
}
