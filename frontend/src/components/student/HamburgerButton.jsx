export default function HamburgerButton({ onClick, isOpen }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
      aria-expanded={isOpen}
      className="
        flex h-10 w-10 flex-col items-center justify-center gap-[5px]
        rounded-arc-sm transition-colors hover:bg-white/10
        focus-visible:outline-2 focus-visible:outline-offset-2
        focus-visible:outline-arc-blue-light
      "
    >
      <span className="h-[2px] w-6 rounded-full bg-arc-text" />
      <span className="h-[2px] w-6 rounded-full bg-arc-text" />
      <span className="h-[2px] w-6 rounded-full bg-arc-text" />
    </button>
  )
}
